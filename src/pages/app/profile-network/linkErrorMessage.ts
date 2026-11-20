import type { TFunction } from "i18next";
import { isPaywallError } from "../../../services/paywall";

/** Toast text for a failed link action: the tier's link limit (402, entitlement
 * `profile.links.max`) gets its own message, other errors their server text. */
export function linkErrorMessage(error: unknown, t: TFunction): string {
	if (isPaywallError(error)) return t("profile_network.errors.link_limit");
	return error instanceof Error ? error.message : t("profile_network.errors.link_failed");
}
