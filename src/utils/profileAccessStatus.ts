import type { ProfileDetail } from "../pages/app/GridPage.types";

export type ProfileAccessStatus = "accessible" | "not_found" | "blocked";

/**
 * GET /v7/profiles/:id always returns 200, even for a profile that is
 * blocked (either way), hidden through /v1/hides, banned or deleted — it
 * comes back as a stub with every field nulled out except profileId, a
 * displayName that's literally the string "4" (blocked/hidden) or "3"
 * (banned/gone), and `profileType: "ERROR"` (a real profile: "FULL").
 *
 * profileType decides when present. Without it (other endpoints, older
 * responses) displayName alone isn't a safe check — a real user could
 * happen to have "3" or "4" as their display name — so this then also
 * requires lastUpdatedTime to be null: a server-controlled bookkeeping
 * timestamp that every real, ever-persisted profile has set, and that a
 * display name choice can't fake.
 */
export function classifyProfileAccess(
	profile: Pick<ProfileDetail, "displayName" | "lastUpdatedTime"> & { profileType?: string | null },
): ProfileAccessStatus {
	if (profile.profileType === "ERROR") {
		return profile.displayName === "4" ? "blocked" : "not_found";
	}
	if (profile.profileType != null || profile.lastUpdatedTime != null) {
		return "accessible";
	}
	if (profile.displayName === "4") {
		return "blocked";
	}
	if (profile.displayName === "3") {
		return "not_found";
	}
	return "accessible";
}
