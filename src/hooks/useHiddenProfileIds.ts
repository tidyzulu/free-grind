import { useEffect, useState } from "react";
import { useAuth } from "../contexts/useAuth";
import { useApiFunctions } from "./useApiFunctions";
import {
	GRID_HIDE_STATE_EVENT,
	invalidateHiddenProfilesCache,
	listHiddenProfileIds,
	type GridHideStateChangeDetail,
} from "../services/profileHide";
import { useProfileHideMode } from "../services/profileHideMode";

/**
 * Profiles the user hid, from whichever hide mode is active (the /v1/hides
 * API or the local chatDb flag, see profileHideMode.ts). Reloaded whenever
 * the active account's chatDb becomes ready (settingsReady) or the mode
 * changes, so switching accounts also switches which profiles are hidden
 * instead of leaking the previous account's set; kept in sync with
 * hide/unhide anywhere in the app through GRID_HIDE_STATE_EVENT.
 */
export function useHiddenProfileIds(): Set<string> {
	const { userId, settingsReady } = useAuth();
	const apiFunctions = useApiFunctions();
	const hideMode = useProfileHideMode();
	const [hiddenProfileIds, setHiddenProfileIds] = useState<Set<string>>(() => new Set());

	useEffect(() => {
		invalidateHiddenProfilesCache();
	}, [userId]);

	useEffect(() => {
		if (!settingsReady) return;
		let cancelled = false;
		void listHiddenProfileIds(apiFunctions).then((ids) => {
			if (!cancelled) setHiddenProfileIds(new Set(ids));
		});
		return () => {
			cancelled = true;
		};
	}, [userId, settingsReady, hideMode, apiFunctions]);

	useEffect(() => {
		const onHideStateChange = (event: Event) => {
			const detail = (event as CustomEvent<GridHideStateChangeDetail>).detail;
			if (!detail) return;
			setHiddenProfileIds((previous) => {
				if (previous.has(detail.profileId) === detail.hidden) return previous;
				const next = new Set(previous);
				if (detail.hidden) next.add(detail.profileId);
				else next.delete(detail.profileId);
				return next;
			});
		};
		window.addEventListener(GRID_HIDE_STATE_EVENT, onHideStateChange as EventListener);
		return () => window.removeEventListener(GRID_HIDE_STATE_EVENT, onHideStateChange as EventListener);
	}, []);

	return hiddenProfileIds;
}
