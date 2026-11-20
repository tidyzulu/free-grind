import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useAuth } from "../../contexts/useAuth";
import { useCanBypassExpiringLimit } from "../../grindr-workarounds";
import {
	isAllowanceExhausted,
	isUnlimitedAllowance,
	subscribeExpiringAllowanceStale,
	type ExpiringAllowance,
	type ExpiringMediaKind,
} from "../../services/expiringAllowance";
import type { RightNowEntitlements } from "../../types/right-now";

/**
 * Right Now post entitlement (GET /v1/rightnow/entitlements/posts). The
 * count depends on the browse location and refills over time, so it is keyed
 * by geohash and refreshed now and then.
 */
export function useEntitlements(userId: number | null, geohash: string | null, enabled = true) {
	const api = useApiFunctions();
	return useQuery<RightNowEntitlements>({
		queryKey: ["entitlements", userId, geohash],
		queryFn: () => api.getEntitlements(),
		staleTime: 10 * 60 * 1000,
		enabled: enabled && !!userId,
	});
}

/**
 * Expiring media allowance (GET /v4/{pics,videos,albums}/expiring/status),
 * per account. Refreshed after every expiring send (see
 * markExpiringAllowanceStale) and when the period may have rolled over.
 */
export function useExpiringAllowance(kind: ExpiringMediaKind, enabled = true) {
	const api = useApiFunctions();
	const { userId } = useAuth();
	const queryClient = useQueryClient();
	useEffect(
		() =>
			subscribeExpiringAllowanceStale((stale) => {
				void queryClient.invalidateQueries({ queryKey: ["expiring-allowance", stale] });
			}),
		[queryClient],
	);
	return useQuery<ExpiringAllowance>({
		queryKey: ["expiring-allowance", kind, userId],
		queryFn: () => api.getExpiringAllowance(kind),
		staleTime: 5 * 60 * 1000,
		retry: 1,
		enabled: enabled && userId != null,
	});
}

export type ExpiringAllowanceInfo = {
	/** Null while unknown (loading, failed): callers keep their old behaviour then. */
	allowance: ExpiringAllowance | null;
	/** Known and capped: worth showing a counter. */
	limited: boolean;
	exhausted: boolean;
	/** Used up and nothing gets past it. */
	blocked: boolean;
	/** Used up, but a Grindr workaround offers a way past it on send. */
	needsBypass: boolean;
};

export function useExpiringAllowanceInfo(kind: ExpiringMediaKind, enabled = true): ExpiringAllowanceInfo {
	const { data } = useExpiringAllowance(kind, enabled);
	const bypassable = useCanBypassExpiringLimit(kind);
	const allowance = enabled ? data ?? null : null;
	const limited = allowance !== null && !isUnlimitedAllowance(allowance);
	const exhausted = allowance !== null && isAllowanceExhausted(allowance);
	return { allowance, limited, exhausted, blocked: exhausted && !bypassable, needsBypass: exhausted && bypassable };
}
