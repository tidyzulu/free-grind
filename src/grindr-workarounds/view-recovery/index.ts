import type { GrindrWorkaround, ViewsApi } from "../types";
import type { InterestItem } from "../../pages/app/interest/interestUtils";
import { PREVIEW_ID_PREFIX, enrichSentTapsWithProfiles } from "../../pages/app/interest/interestUtils";
import { getAllCachedBrowseCardsById, getAllCachedBrowseCardsByImageHash } from "../../pages/app/gridpage/cache";
import { listConversations, listProfileSnapshotIdentities } from "../../services/chatDb";
import { extractMediaHashFromUrl } from "../../utils/media";
import { interestIdentityStore } from "./identityStore";
import { interestViewsStore, setActiveInterestStoreUser } from "./historyStore";
import { type BrowseHashMatch, type DistanceCandidate, fromStoredView, recoverViews, toStoredView } from "./recover";
import { ViewsIntro } from "./ViewsIntro";

/**
 * Grindr shows free users only their latest viewer in full; the rest come as
 * locked previews. This reveals them from local evidence (recover.ts) and
 * keeps viewers the server stops listing (historyStore, 30 days).
 */
export const viewRecovery: GrindrWorkaround = {
	id: "view-recovery",

	// The eyeball names the latest viewer even after the app was closed (no WS
	// event then) — the main way to unlock photo-less previews.
	async prepareViews(api: ViewsApi) {
		const eyeball = await api.getViewsEyeball().catch(() => null);
		if (!eyeball) return;
		await Promise.all([
			interestIdentityStore.rememberViewEvent(eyeball),
			interestIdentityStore.rememberHashes([{ hash: eyeball.imageHash, profileId: eyeball.profileId }]),
		]).catch(() => {});
	},

	async enhanceViews({ views, taps, api }) {
		const cachedViews = (await interestViewsStore.getAll()).map(fromStoredView);

		// Recover locked preview entries via every known photo → profile pair
		// and the viewers named by WS view events.
		const [identityByHash, viewEvents] = await Promise.all([
			buildIdentityIndex(taps),
			interestIdentityStore.getViewEvents().catch(() => []),
		]);
		const recovered =
			views === null ? cachedViews : recoverViews(views, cachedViews, identityByHash, viewEvents, buildDistanceCandidates(taps));
		const result = await enrichSentTapsWithProfiles(
			recovered,
			api.getProfilesByIds,
			// Only recovered previews: unlocked viewers come with their name
			// (or genuinely have none), no need to re-ask every load.
			(item) => item.isFromCache === true,
		);

		// Learn from this load too: unlocked/recovered viewers and tappers.
		void interestIdentityStore.rememberHashes(
			[...result, ...taps]
				.filter((item) => !item.profileId.startsWith(PREVIEW_ID_PREFIX))
				.map((item) => ({ hash: item.imageHash, profileId: item.profileId, displayName: item.displayName })),
		);

		// Keep the merged views, and drop cached rows the merge evicted (locked
		// previews resolved to a real profile) — otherwise they come back from
		// IndexedDB on the next load.
		await interestViewsStore.upsertMany(result.map((item) => toStoredView(item)));
		const keptIds = new Set(result.map((item) => item.profileId));
		await interestViewsStore.deleteMany(
			cachedViews.filter((item) => !keptIds.has(item.profileId)).map((item) => item.profileId),
		);
		return result;
	},

	// The event names the real viewer even when the views list only returns a
	// locked preview — persisted before the refetch the event triggers, so
	// that refetch can already recover it.
	async onViewReceived(view) {
		await Promise.all([
			interestIdentityStore.rememberViewEvent(view),
			interestIdentityStore.rememberHashes([{ hash: view.imageHash, profileId: view.profileId }]),
		]).catch(() => {});
	},

	// The browse cache is memory-only; persist the photo → profile pairs so
	// locked view previews can still be recovered after a restart.
	onBrowseCards(cards) {
		void interestIdentityStore.rememberHashes(
			cards.map((card) => ({
				hash: card.primaryImageUrl ? extractMediaHashFromUrl(card.primaryImageUrl) : null,
				profileId: card.profileId,
				displayName: card.displayName ?? null,
			})),
		);
	},

	ViewsIntro,
	onActiveUser: setActiveInterestStoreUser,
};

const toMatch = (profileId: string, displayName: string | null): BrowseHashMatch => ({
	profileId,
	displayName,
	onlineUntil: null,
	rightNow: null,
});

/**
 * Photo hash → profile index for recovering locked view previews, weakest
 * source first so stronger ones override on collision: persisted hints,
 * opened-profile snapshots, chat partners, received taps, the live browse grid.
 */
async function buildIdentityIndex(taps: InterestItem[]): Promise<Map<string, BrowseHashMatch>> {
	const index = new Map<string, BrowseHashMatch>();
	const add = (hash: string | null | undefined, match: BrowseHashMatch) => {
		if (hash) index.set(hash, match);
	};

	const [persisted, snapshots, conversations] = await Promise.all([
		interestIdentityStore.getHashes().catch(() => []),
		listProfileSnapshotIdentities().catch(() => []),
		listConversations({ includeArchived: true }).catch(() => []),
	]);

	for (const row of persisted) add(row.hash, toMatch(row.profileId, row.displayName));
	for (const row of snapshots) add(row.imageHash, toMatch(row.profileId, row.displayName));
	for (const conversation of conversations) {
		const data = conversation.entry.data;
		for (const participant of data.participants ?? []) {
			const profileId = String(participant.profileId);
			const isOther = conversation.otherProfileId == null || conversation.otherProfileId === profileId;
			add(participant.primaryMediaHash, toMatch(profileId, isOther ? data.name?.trim() || null : null));
		}
	}
	for (const tap of taps) add(tap.imageHash, toMatch(tap.profileId, tap.displayName));
	for (const [hash, card] of getAllCachedBrowseCardsByImageHash()) {
		add(hash, {
			profileId: card.profileId,
			displayName: card.displayName ?? null,
			onlineUntil: card.onlineUntil ?? null,
			rightNow: card.rightNow ?? null,
		});
	}
	return index;
}

/** Photo-less profiles with a known distance — candidates for photo-less
 * locked previews: received tappers (fetched together with the views, so
 * their distance is from the same moment) and the live browse grid (real,
 * not estimated distances). */
function buildDistanceCandidates(taps: InterestItem[]): DistanceCandidate[] {
	const candidates: DistanceCandidate[] = [];
	const seen = new Set<string>();
	for (const tap of taps) {
		if (tap.imageHash || typeof tap.distanceMeters !== "number" || seen.has(tap.profileId)) continue;
		seen.add(tap.profileId);
		candidates.push({
			profileId: tap.profileId,
			displayName: tap.displayName,
			onlineUntil: tap.onlineUntil ?? null,
			rightNow: tap.rightNow ?? null,
			distanceMeters: tap.distanceMeters,
			favorite: null,
		});
	}
	for (const card of getAllCachedBrowseCardsById().values()) {
		if (card.primaryImageUrl || typeof card.distanceMeters !== "number" || seen.has(card.profileId)) continue;
		seen.add(card.profileId);
		candidates.push({
			profileId: card.profileId,
			displayName: card.displayName ?? null,
			onlineUntil: card.onlineUntil ?? null,
			rightNow: card.rightNow ?? null,
			distanceMeters: card.distanceMeters,
			favorite: typeof card.favorite === "boolean" ? card.favorite : null,
		});
	}
	return candidates;
}
