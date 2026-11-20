/**
 * profileHide.ts — hide/unhide a profile, in whichever mode is active (see
 * profileHideMode.ts):
 *
 * - "api": the official /v1/hides endpoints. The server drops hidden
 *   profiles from the cascade and answers GET /v7/profiles/{id} with the
 *   blocked stub (POST /v3/profiles still returns them, see
 *   getProfileDetail); the list follows the account everywhere.
 * - "local": a client-side flag in chatDb (mirrors conversationHide.ts). The
 *   profile still comes back through /v4/cascade like any other card; only
 *   GridPage's sortedCards view filters it out.
 *
 * Either way GridPage also filters by the hidden-id set (useHiddenProfileIds),
 * so a hide takes effect at once without refetching the grid.
 */

import * as chatDb from "./chatDb";
import { getProfileHideMode } from "./profileHideMode";
import { appLog } from "../utils/logger";

// A profile's hidden flag changed — dispatched so any mounted grid UI (which
// keeps its own in-memory hidden-profile-ids set) can stay in sync without
// needing a bespoke update at every call site.
export const GRID_HIDE_STATE_EVENT = "fg:grid-hide-state";

export type GridHideStateChangeDetail = { profileId: string; hidden: boolean };

/** The API methods hiding needs (a subset of useApiFunctions()). */
export type ProfileHideApi = {
	getHiddenProfiles(): Promise<{ profileId: string; displayName: string | null; mediaHash: string | null }[]>;
	hideProfile(profileId: string): Promise<unknown>;
	unhideProfile(profileId: string): Promise<unknown>;
	unhideAllProfiles(): Promise<unknown>;
};

export type HiddenProfileEntry = {
	profileId: string;
	displayName: string | null;
	avatarMediaHash: string | null;
};

function dispatchHideStateChange(detail: GridHideStateChangeDetail) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent<GridHideStateChangeDetail>(GRID_HIDE_STATE_EVENT, { detail }));
}

// --- API list cache -------------------------------------------------------------
// Several screens ask for the list in quick succession (grid + profile page);
// a short-lived shared request keeps that to one GET /v1/hides. Any change
// through this module drops it.

const API_LIST_TTL_MS = 5_000;
let apiListCache: { at: number; request: Promise<HiddenProfileEntry[]> } | null = null;

export function invalidateHiddenProfilesCache(): void {
	apiListCache = null;
}

/** Listing only needs the GET; the API layer passes just that. */
type HiddenListApi = Pick<ProfileHideApi, "getHiddenProfiles">;

function fetchApiHiddenProfiles(api: HiddenListApi): Promise<HiddenProfileEntry[]> {
	if (apiListCache && Date.now() - apiListCache.at < API_LIST_TTL_MS) return apiListCache.request;
	const request = api.getHiddenProfiles().then((hides) =>
		// The server lists oldest first; every list here is newest first.
		hides
			.map(({ profileId, displayName, mediaHash }) => ({ profileId, displayName, avatarMediaHash: mediaHash }))
			.reverse(),
	);
	const entry = { at: Date.now(), request };
	apiListCache = entry;
	request.catch(() => {
		if (apiListCache === entry) apiListCache = null;
	});
	return request;
}

// --- Public API -----------------------------------------------------------------

/** Hidden profiles of the active mode, newest first. Throws if the API list can't be loaded. */
export async function listHiddenProfiles(api: HiddenListApi): Promise<HiddenProfileEntry[]> {
	if (getProfileHideMode() === "api") return fetchApiHiddenProfiles(api);
	return (await chatDb.listHiddenProfiles()).map(({ profileId, displayName, avatarMediaHash }) => ({
		profileId,
		displayName,
		avatarMediaHash,
	}));
}

/** Ids of the active mode's hidden profiles; empty (logged) when they can't be loaded. */
export async function listHiddenProfileIds(api: HiddenListApi): Promise<string[]> {
	try {
		if (getProfileHideMode() === "api") return (await fetchApiHiddenProfiles(api)).map((p) => p.profileId);
		return await chatDb.listHiddenProfileIds();
	} catch (error) {
		appLog.warn("[profile-hide] failed to load hidden profiles", error);
		return [];
	}
}

/**
 * Ids hidden on the server (/v1/hides), whatever the active mode — hides made
 * on another device or in the official app count too. Empty (logged) when
 * the list can't be loaded.
 */
export async function listServerHiddenProfileIds(api: HiddenListApi): Promise<string[]> {
	try {
		return (await fetchApiHiddenProfiles(api)).map((p) => p.profileId);
	} catch (error) {
		appLog.warn("[profile-hide] failed to load server hidden profiles", error);
		return [];
	}
}

/** Hides a profile; false when that failed (already logged). */
export async function hideProfile(
	api: ProfileHideApi,
	profileId: string,
	displayName: string | null = null,
	avatarMediaHash: string | null = null,
): Promise<boolean> {
	try {
		if (getProfileHideMode() === "api") {
			invalidateHiddenProfilesCache();
			await api.hideProfile(profileId);
		} else {
			await chatDb.hideProfile(profileId, displayName, avatarMediaHash);
		}
		dispatchHideStateChange({ profileId, hidden: true });
		return true;
	} catch (error) {
		appLog.error(`[profile-hide] failed to hide ${profileId}`, error);
		return false;
	}
}

/** Unhides a profile; false when that failed (already logged). */
export async function unhideProfile(api: ProfileHideApi, profileId: string): Promise<boolean> {
	try {
		if (getProfileHideMode() === "api") {
			invalidateHiddenProfilesCache();
			await api.unhideProfile(profileId);
		} else {
			await chatDb.unhideProfile(profileId);
		}
		dispatchHideStateChange({ profileId, hidden: false });
		return true;
	} catch (error) {
		appLog.error(`[profile-hide] failed to unhide ${profileId}`, error);
		return false;
	}
}

/**
 * Unhides every profile of the active mode (`profileIds`: the ones currently
 * listed, for the change events). Throws on failure.
 */
export async function unhideAllProfiles(api: ProfileHideApi, profileIds: readonly string[]): Promise<void> {
	if (getProfileHideMode() === "api") {
		invalidateHiddenProfilesCache();
		await api.unhideAllProfiles();
	} else {
		await Promise.all(profileIds.map((profileId) => chatDb.unhideProfile(profileId)));
	}
	for (const profileId of profileIds) dispatchHideStateChange({ profileId, hidden: false });
}
