import { useSyncExternalStore } from "react";

/**
 * Where hidden profiles live — a dev option.
 *
 * "api" (default, like the official app): hides are stored on the server
 * through /v1/hides. The server leaves them out of the grid (their details
 * load through POST /v3/profiles, see getProfileDetail), and the list follows
 * the account to other devices and clients.
 *
 * "local": hides are a client-side flag in chatDb only; the server never
 * learns about them, and GridPage filters them out of the cards itself.
 *
 * The two lists are separate: switching shows the other mode's list and
 * leaves the one switched away from as it is.
 */
export type ProfileHideMode = "api" | "local";

const STORAGE_KEY = "fg-profile-hide-mode";
const listeners = new Set<() => void>();

function readStored(): ProfileHideMode {
	try {
		return window.localStorage.getItem(STORAGE_KEY) === "local" ? "local" : "api";
	} catch {
		return "api";
	}
}

let mode: ProfileHideMode = readStored();

export function getProfileHideMode(): ProfileHideMode {
	return mode;
}

export function setProfileHideMode(next: ProfileHideMode): void {
	if (next === mode) return;
	mode = next;
	try {
		if (next === "api") window.localStorage.removeItem(STORAGE_KEY);
		else window.localStorage.setItem(STORAGE_KEY, next);
	} catch {
		// Storage unavailable: the choice holds for this session only.
	}
	for (const listener of listeners) listener();
}

export function subscribeProfileHideMode(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The current hide mode; follows changes live. */
export function useProfileHideMode(): ProfileHideMode {
	return useSyncExternalStore(subscribeProfileHideMode, getProfileHideMode, getProfileHideMode);
}
