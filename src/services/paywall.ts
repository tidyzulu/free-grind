import { ApiFunctionError } from "./apiHelpers";

const PAYWALL_URNS = new Set(["urn:gr:err:entitlement_limit", "urn:gr:err:tiered_feature"]);

/** Whether the server refused the call because it needs a subscription (or an allowance is used up). */
export function isPaywallError(error: unknown): boolean {
	if (!(error instanceof ApiFunctionError)) return false;
	const payload = error.payload;
	if (!payload || typeof payload !== "object") return false;
	const type = (payload as { type?: unknown }).type;
	return typeof type === "string" && PAYWALL_URNS.has(type);
}
