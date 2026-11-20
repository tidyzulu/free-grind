/**
 * Recovers who is behind a locked "viewed me" preview: by photo hash (any
 * profile seen with that photo before), by the `viewed_me` event that named
 * the viewer at that time, or, for photo-less previews, by a unique photo-less
 * profile at the same distance. Also keeps earlier views the server no longer
 * lists (historyStore).
 */
import { type InterestItem, PREVIEW_ID_PREFIX, mergeViewItem, mergeViews, sortByNewest } from "../../pages/app/interest/interestUtils";
import type { StoredInterestView } from "./historyStore";

export type BrowseHashMatch = {
	profileId: string;
	displayName: string | null;
	onlineUntil: number | null;
	rightNow: string | null;
};

/** A `viewed_me` WebSocket event: names the real viewer behind a locked preview. */
export type ViewEventMatch = {
	profileId: string;
	imageHash: string | null;
	timestamp: number;
};

/** A photo-less profile seen in the browse grid, with its exact distance. */
export type DistanceCandidate = BrowseHashMatch & {
	distanceMeters: number;
	favorite: boolean | null;
};

export function fromStoredView(row: StoredInterestView): InterestItem {
	return {
		profileId: row.profileId,
		displayName: row.displayName,
		imageHash: row.imageHash,
		timestamp: row.timestamp ?? row.updatedAt,
		tapType: null,
		viewCount: row.viewCount,
		canOpenProfile: !row.profileId.startsWith(PREVIEW_ID_PREFIX),
		distanceMeters: row.distanceMeters ?? null,
		isFavorite: row.isFavorite ?? null,
		recoveredBy: row.recoveredBy ?? null,
		isFromCache: true,
	};
}

export function toStoredView(item: InterestItem): Omit<StoredInterestView, "updatedAt"> {
	return {
		profileId: item.profileId,
		displayName: item.displayName ?? "",
		imageHash: item.imageHash,
		timestamp: item.timestamp,
		viewCount: item.viewCount,
		distanceMeters: item.distanceMeters ?? null,
		isFavorite: item.isFavorite ?? null,
		recoveredBy: item.recoveredBy ?? null,
	};
}

// The WS event's timestamp and the preview's lastViewed describe the same view;
// allow a little skew, but only accept a match that points at one profile.
const VIEW_EVENT_MATCH_TOLERANCE_MS = 5000;

function findViewEventMatch(item: InterestItem, viewEvents: ViewEventMatch[]): ViewEventMatch | null {
	if (item.timestamp == null || viewEvents.length === 0) return null;
	const timestamp = item.timestamp;
	const candidates = viewEvents.filter(
		(event) =>
			Math.abs(event.timestamp - timestamp) <= VIEW_EVENT_MATCH_TOLERANCE_MS &&
			// A known, different photo rules the event out.
			(!item.imageHash || !event.imageHash || event.imageHash === item.imageHash),
	);
	if (new Set(candidates.map((event) => event.profileId)).size !== 1) return null;
	return candidates.reduce((best, event) =>
		Math.abs(event.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? event : best,
	);
}

// Both distances are measured from our own position, so they only agree while
// neither side moved much; keep the window tight and demand a single candidate.
function distanceTolerance(meters: number): number {
	return Math.max(30, meters * 0.005);
}

function findDistanceMatch(
	item: InterestItem,
	candidates: DistanceCandidate[],
	takenIds: Set<string>,
): DistanceCandidate | null {
	if (item.distanceMeters == null || candidates.length === 0) return null;
	const distance = item.distanceMeters;
	const tolerance = distanceTolerance(distance);
	const matches = candidates.filter((candidate) => {
		if (takenIds.has(candidate.profileId)) return false;
		if (Math.abs(candidate.distanceMeters - distance) > tolerance) return false;
		// Contradicting attributes rule a candidate out.
		if (item.isFavorite != null && candidate.favorite != null && item.isFavorite !== candidate.favorite) return false;
		const itemRightNow = item.rightNow === "HOSTING" || item.rightNow === "NOT_HOSTING" ? item.rightNow : null;
		const candidateRightNow = candidate.rightNow === "HOSTING" || candidate.rightNow === "NOT_HOSTING" ? candidate.rightNow : null;
		if (item.rightNow != null && candidate.rightNow != null && itemRightNow !== candidateRightNow) return false;
		return true;
	});
	return new Set(matches.map((m) => m.profileId)).size === 1 ? matches[0] : null;
}

/**
 * Merges the server's views (`incoming`, see parseViews) on top of the kept
 * history and recovers still-locked previews, fresh and cached alike.
 */
export function recoverViews(
	incoming: InterestItem[],
	previouslyCached: InterestItem[],
	identityByHash?: Map<string, BrowseHashMatch>,
	viewEvents: ViewEventMatch[] = [],
	distanceCandidates: DistanceCandidate[] = [],
): InterestItem[] {
	// 1. Merging: cache (history) first, then fresh server entries on top.
	const mergedMap = mergeViews(previouslyCached, incoming);

	// 2. Identity index (photo hash → profile). Weakest first: persisted/browse
	// hints from the caller, then known interest entries, then this response.
	const hashToProfile = new Map<string, BrowseHashMatch>();
	if (identityByHash) {
		for (const [hash, match] of identityByHash) hashToProfile.set(hash, match);
	}
	for (const item of [...previouslyCached, ...incoming]) {
		if (item.imageHash && !item.profileId.startsWith(PREVIEW_ID_PREFIX)) {
			hashToProfile.set(item.imageHash, {
				profileId: item.profileId,
				displayName: item.displayName,
				onlineUntil: item.onlineUntil ?? null,
				rightNow: item.rightNow ?? null,
			});
		}
	}
	const idToProfile = new Map<string, BrowseHashMatch>();
	for (const match of hashToProfile.values()) {
		const known = idToProfile.get(match.profileId);
		if (!known || (!known.displayName && match.displayName)) idToProfile.set(match.profileId, match);
	}

	// 3. Recover still-locked previews — fresh and cached alike — by photo
	// hash, else by the view event that named the viewer at that time, else
	// (photo-less previews only) by a unique photo-less grid profile at the
	// same distance. A profile appears once in the views list, so IDs already
	// in it can't be behind another preview.
	const takenIds = new Set(Array.from(mergedMap.keys()).filter((id) => !id.startsWith(PREVIEW_ID_PREFIX)));
	// Previews recovered on an earlier load, by view time. The next load gets
	// the same view as a fresh locked preview again; without this it would
	// sit next to its recovered twin whenever today's evidence is weaker
	// (e.g. a second view event close by now makes the time match ambiguous).
	const recoveredByTimestamp = new Map<number, InterestItem[]>();
	for (const item of mergedMap.values()) {
		if (item.profileId.startsWith(PREVIEW_ID_PREFIX) || !item.isFromCache || item.timestamp == null) continue;
		const list = recoveredByTimestamp.get(item.timestamp) ?? [];
		list.push(item);
		recoveredByTimestamp.set(item.timestamp, list);
	}
	const findEarlierRecovery = (item: InterestItem): InterestItem | null => {
		if (item.timestamp == null) return null;
		const matches = (recoveredByTimestamp.get(item.timestamp) ?? []).filter(
			(known) =>
				(!item.imageHash || !known.imageHash || item.imageHash === known.imageHash) &&
				(item.distanceMeters == null ||
					known.distanceMeters == null ||
					Math.abs(item.distanceMeters - known.distanceMeters) <= distanceTolerance(item.distanceMeters)),
		);
		return matches.length === 1 ? matches[0] : null;
	};

	for (const [id, item] of Array.from(mergedMap)) {
		if (!id.startsWith(PREVIEW_ID_PREFIX)) continue;
		const earlier = findEarlierRecovery(item);
		if (earlier) {
			// Same view, already identified — fold the fresh preview data in.
			mergedMap.delete(id);
			mergedMap.set(earlier.profileId, {
				...mergeViewItem(item, earlier),
				displayName: earlier.displayName ?? item.displayName,
				timestamp: earlier.timestamp,
				distanceMeters: item.distanceMeters ?? earlier.distanceMeters,
				isFavorite: item.isFavorite ?? earlier.isFavorite,
				onlineUntil: item.onlineUntil ?? earlier.onlineUntil,
				rightNow: item.rightNow ?? earlier.rightNow,
			});
			continue;
		}
		const byHash = item.imageHash ? hashToProfile.get(item.imageHash) : undefined;
		const byEvent = byHash ? null : findViewEventMatch(item, viewEvents);
		const byDistance =
			byHash || byEvent || item.imageHash ? null : findDistanceMatch(item, distanceCandidates, takenIds);
		const profileId = byHash?.profileId ?? byEvent?.profileId ?? byDistance?.profileId;
		if (!profileId) continue;
		const known = byHash ?? byDistance ?? idToProfile.get(profileId);
		const recoveredBy = byHash ? "hash" : byEvent ? "event" : "distance";
		takenIds.add(profileId);

		const recovered: InterestItem = {
			...item,
			profileId,
			displayName: known?.displayName ?? null,
			canOpenProfile: true,
			isFromCache: true,
			recoveredBy,
			// Fresh presence from the response wins over the (possibly stale) match.
			onlineUntil: item.onlineUntil ?? known?.onlineUntil ?? null,
			rightNow: item.rightNow ?? known?.rightNow ?? null,
		};
		mergedMap.delete(id);

		const existing = mergedMap.get(profileId);
		if (!existing) {
			mergedMap.set(profileId, recovered);
			continue;
		}
		// An entry for that profile already exists: it wins, the recovered
		// preview only fills gaps and can carry a newer view time.
		const merged = mergeViewItem(recovered, existing);
		merged.displayName = existing.displayName ?? recovered.displayName;
		merged.timestamp = Math.max(existing.timestamp ?? 0, recovered.timestamp ?? 0) || null;
		mergedMap.set(profileId, merged);
	}

	// Drop locked previews whose hash now belongs to a real profile (e.g. a
	// cached twin of a profile that's unlocked now).
	const realHashes = new Set<string>();
	for (const item of mergedMap.values()) {
		if (item.imageHash && !item.profileId.startsWith(PREVIEW_ID_PREFIX)) {
			realHashes.add(item.imageHash);
		}
	}
	for (const [id, item] of mergedMap) {
		if (id.startsWith(PREVIEW_ID_PREFIX) && item.imageHash && realHashes.has(item.imageHash)) {
			mergedMap.delete(id);
		}
	}

	return sortByNewest(mergedMap.values());
}
