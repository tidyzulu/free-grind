import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useFeatureFlag } from "../../services/assignmentsStore";
import {
	PROFILE_REPUTATION_FLAG,
	type MyProfileLinks,
	type ProfileLinks,
	type ProfileReputation,
} from "../../services/api/reputationMethods";

/**
 * Profile reputation (Free Grind server, flag `profile-reputation`): the
 * reputation index, linked profiles and the "personally known" mark.
 */

export const reputationKeys = {
	reputation: (profileId: string | null | undefined) => ["profile-reputation", profileId ?? null] as const,
	links: (profileId: string | null | undefined) => ["profile-links", profileId ?? null] as const,
	myLinks: ["my-profile-links"] as const,
};

export function useProfileReputationEnabled(): boolean {
	return useFeatureFlag(PROFILE_REPUTATION_FLAG);
}

/** Refetches everything link-related (after an own action or a realtime event). */
export function invalidateProfileLinks(queryClient: QueryClient): void {
	void queryClient.invalidateQueries({ queryKey: ["profile-links"] });
	void queryClient.invalidateQueries({ queryKey: reputationKeys.myLinks });
}

export function useProfileReputation(profileId: string | null | undefined, enabled = true) {
	const api = useApiFunctions();
	const flagOn = useProfileReputationEnabled();
	return useQuery<ProfileReputation>({
		queryKey: reputationKeys.reputation(profileId),
		queryFn: () => api.getProfileReputation(profileId!),
		enabled: flagOn && enabled && !!profileId,
		staleTime: 1000 * 60 * 5,
		retry: 1,
	});
}

export function useProfileLinks(profileId: string | null | undefined, enabled = true) {
	const api = useApiFunctions();
	const flagOn = useProfileReputationEnabled();
	return useQuery<ProfileLinks>({
		queryKey: reputationKeys.links(profileId),
		queryFn: () => api.getProfileLinks(profileId!),
		enabled: flagOn && enabled && !!profileId,
		staleTime: 1000 * 60 * 5,
		retry: 1,
	});
}

export function useMyProfileLinks(enabled = true) {
	const api = useApiFunctions();
	const flagOn = useProfileReputationEnabled();
	return useQuery<MyProfileLinks>({
		queryKey: reputationKeys.myLinks,
		queryFn: () => api.getMyProfileLinks(),
		enabled: flagOn && enabled,
		staleTime: 1000 * 60,
		retry: 1,
	});
}

export type ProfileLinkAction = "request" | "accept" | "remove";

export function useProfileLinkAction() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ profileId, action }: { profileId: string; action: ProfileLinkAction }) =>
			action === "request"
				? api.requestProfileLink(profileId)
				: action === "accept"
					? api.acceptProfileLink(profileId)
					: api.removeProfileLink(profileId),
		onSettled: () => invalidateProfileLinks(queryClient),
	});
}

export function useSetPersonallyKnown() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ profileId, known }: { profileId: string; known: boolean }) => api.setPersonallyKnown(profileId, known),
		onMutate: ({ profileId, known }) => {
			const key = reputationKeys.reputation(profileId);
			const previous = queryClient.getQueryData<ProfileReputation>(key);
			if (previous) queryClient.setQueryData<ProfileReputation>(key, { ...previous, knownByMe: known });
			return { previous };
		},
		onError: (_error, { profileId }, context) => {
			if (context?.previous) queryClient.setQueryData(reputationKeys.reputation(profileId), context.previous);
		},
		onSettled: (_data, _error, { profileId }) => {
			void queryClient.invalidateQueries({ queryKey: reputationKeys.reputation(profileId) });
		},
	});
}
