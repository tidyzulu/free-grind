import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useFeatureFlag } from "../../services/assignmentsStore";
import { CRUISING_SPOTS_FLAG, type CruisingPrefs, type CruisingSpotDetail, type CruisingSpotList, type CruisingSpotSuggestion, type CruisingSpotVote } from "../../services/api/cruisingMethods";

/** Cruising spots on the grid map (Free Grind server, flag `cruising-spots`). */

export const cruisingKeys = {
	list: (geohash: string | null) => ["cruising-spots", geohash] as const,
	detail: (spotId: string | null) => ["cruising-spot", spotId] as const,
	prefs: ["cruising-prefs"] as const,
};

/** Own cruising preferences (automatic check-in). */
export function useCruisingPrefs(enabled = true) {
	const api = useApiFunctions();
	const flagOn = useCruisingSpotsEnabled();
	return useQuery<CruisingPrefs>({
		queryKey: cruisingKeys.prefs,
		queryFn: () => api.getCruisingPrefs(),
		enabled: flagOn && enabled,
		staleTime: 5 * 60_000,
		retry: 1,
	});
}

/** Refresh interval of the spots (check-in counts) while the map is open. */
const LIST_REFRESH_MS = 60_000;

export function useCruisingSpotsEnabled(): boolean {
	return useFeatureFlag(CRUISING_SPOTS_FLAG);
}

export function invalidateCruising(queryClient: QueryClient): void {
	void queryClient.invalidateQueries({ queryKey: ["cruising-spots"] });
	void queryClient.invalidateQueries({ queryKey: ["cruising-spot"] });
}

/** Spots around a coarse geohash (the server lists 50 km around its center). */
export function useCruisingSpots(geohash: string | null, enabled = true) {
	const api = useApiFunctions();
	const flagOn = useCruisingSpotsEnabled();
	return useQuery<CruisingSpotList>({
		queryKey: cruisingKeys.list(geohash),
		queryFn: () => api.getCruisingSpots(geohash!),
		enabled: flagOn && enabled && !!geohash,
		staleTime: 30_000,
		refetchInterval: enabled ? LIST_REFRESH_MS : false,
		placeholderData: (previous) => previous,
		retry: 1,
	});
}

export function useCruisingSpot(spotId: string | null) {
	const api = useApiFunctions();
	const flagOn = useCruisingSpotsEnabled();
	return useQuery<CruisingSpotDetail>({
		queryKey: cruisingKeys.detail(spotId),
		queryFn: () => api.getCruisingSpot(spotId!),
		enabled: flagOn && !!spotId,
		staleTime: 15_000,
		refetchInterval: spotId ? 30_000 : false,
		retry: 1,
	});
}

export function useSuggestCruisingSpot() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CruisingSpotSuggestion) => api.suggestCruisingSpot(input),
		onSuccess: () => invalidateCruising(queryClient),
	});
}

export function useWithdrawCruisingSpot() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (spotId: string) => api.withdrawCruisingSpot(spotId),
		onSuccess: () => invalidateCruising(queryClient),
	});
}

export function useCruisingCheckIn() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ spotId, geohash }: { spotId: string; geohash: string | null }) => api.checkInAtCruisingSpot(spotId, geohash),
		onSettled: () => invalidateCruising(queryClient),
	});
}

export function useCruisingVote() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ spotId, vote, geohash }: { spotId: string; vote: CruisingSpotVote | null; geohash: string | null }) => api.voteOnCruisingSpot(spotId, vote, geohash),
		onSettled: () => invalidateCruising(queryClient),
	});
}

/** Own "check in automatically" preference; flips the cached lists at once. */
export function useSetCruisingAutoCheckIn() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (autoCheckIn: boolean) => api.setCruisingAutoCheckIn(autoCheckIn),
		onMutate: (autoCheckIn) => {
			queryClient.setQueryData<CruisingPrefs>(cruisingKeys.prefs, (prefs) => (prefs ? { ...prefs, autoCheckIn } : prefs));
			queryClient.setQueriesData<CruisingSpotList>({ queryKey: ["cruising-spots"] }, (list) => (list ? { ...list, autoCheckIn } : list));
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: cruisingKeys.prefs });
			invalidateCruising(queryClient);
		},
	});
}

export function useCruisingCheckOut() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api.checkOutOfCruisingSpot(),
		onSettled: () => invalidateCruising(queryClient),
	});
}
