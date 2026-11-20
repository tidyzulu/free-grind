import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useEffect } from "react";
import { TAP_RECEIVED_EVENT, VIEW_RECEIVED_EVENT } from "../../components/ChatRealtimeBridge";
import {
	parseViews,
	normalizeTaps,
	normalizeSentTaps,
	enrichSentTapsWithProfiles,
	PREVIEW_ID_PREFIX,
} from "../../pages/app/interest/interestUtils";
import { getAllCachedBrowseCardsById } from "../../pages/app/gridpage/cache";
import { snapshotMissingProfiles } from "../../services/profileSnapshotPrefetch";
import { useTranslation } from "react-i18next";
import { DEFAULT_STALE_TIME_MS } from "../../config/ui-constants";
import { enhanceViews, prepareViews } from "../../grindr-workarounds";

export function useInterestData() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	const { t } = useTranslation();

	const query = useQuery({
		queryKey: ["interest", "list"],
		queryFn: async () => {
			// 1. Parallel fetch from API
			const [tapsResponse, viewsResponse, sentTapsResponse] = await Promise.all([
				api.getTaps(),
				api.getViews(),
				api.getSentTaps().catch(() => []),
				prepareViews(api).catch(() => {}),
			]);

			// 2. Normalize. The views list is the server's own unless a Grindr
			// workaround enhances it (see grindr-workarounds).
			const normalizedTaps = normalizeTaps(tapsResponse, t);
			const normalizedViews = await enhanceViews({ views: parseViews(viewsResponse), taps: normalizedTaps, api });
			// Snapshot every opened-up viewer/tapper in the background, so their
			// profile stays openable even after a block (live data is a stub then).
			void snapshotMissingProfiles(
				[...normalizedViews, ...normalizedTaps]
					.filter((item) => item.canOpenProfile && !item.profileId.startsWith(PREVIEW_ID_PREFIX))
					.map((item) => item.profileId),
				api.getProfileDetail,
			);
			const cacheResolvedSentTaps = normalizeSentTaps(sentTapsResponse, getAllCachedBrowseCardsById());
			// Bulk-resolve anyone the browse-grid cache didn't recognize — the
			// sent-taps endpoint only returns bare ids, unlike received taps/views.
			const normalizedSentTaps = await enrichSentTapsWithProfiles(
				cacheResolvedSentTaps,
				api.getProfilesByIds,
			);

			return {
				taps: normalizedTaps,
				views: normalizedViews,
				sentTaps: normalizedSentTaps,
				// Extract viewedCount from the raw response for the UI
				viewedCount: (viewsResponse as any)?.totalViewers || (viewsResponse as any)?.data?.totalViewers || 0
			};
		},
		staleTime: DEFAULT_STALE_TIME_MS,
		refetchOnWindowFocus: true, // Auto-sync when app returns to foreground
	});

	// Handle WebSocket updates
	useEffect(() => {
		const handleUpdate = () => {
			// Invalidate query to trigger a background refetch
			queryClient.invalidateQueries({ queryKey: ["interest", "list"] });
		};

		window.addEventListener(TAP_RECEIVED_EVENT, handleUpdate);
		window.addEventListener(VIEW_RECEIVED_EVENT, handleUpdate);

		return () => {
			window.removeEventListener(TAP_RECEIVED_EVENT, handleUpdate);
			window.removeEventListener(VIEW_RECEIVED_EVENT, handleUpdate);
		};
	}, [queryClient]);

	return query;
}
