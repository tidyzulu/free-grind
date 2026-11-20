import { z } from "zod";
import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess, parseJsonSafe } from "../apiHelpers";

/**
 * Profile reputation — Free Grind server extension (flag `profile-reputation`):
 * the "personally known" mark, linked profiles (request → confirm)
 * and the reputation index shown on profiles.
 */

export const PROFILE_REPUTATION_FLAG = "profile-reputation";

/** Realtime event: a link or link request with `profileId` changed; refreshes profile sections and the links page. */
export const PROFILE_LINK_EVENT = "profile.v1.link.updated";

const linkStatusSchema = z.enum(["none", "pending_outgoing", "pending_incoming", "accepted"]);
export type ProfileLinkStatus = z.infer<typeof linkStatusSchema>;

const linkedProfileSchema = z.object({
	profileId: z.string(),
	displayName: z.string().nullable().default(null),
	primaryMediaHash: z.string().nullable().default(null),
	since: z.number().default(0),
});
export type LinkedProfile = z.infer<typeof linkedProfileSchema>;

const reputationSchema = z.object({
	profileId: z.string(),
	knownByCount: z.number().default(0),
	knownByVouchedCount: z.number().default(0),
	score: z.number().default(0),
	level: z.number().default(0),
	knownByMe: z.boolean().default(false),
});
export type ProfileReputation = z.infer<typeof reputationSchema>;

const profileLinksSchema = z.object({
	links: z.array(linkedProfileSchema).default([]),
	status: linkStatusSchema.default("none"),
});
export type ProfileLinks = z.infer<typeof profileLinksSchema>;

const myLinksSchema = z.object({
	links: z.array(linkedProfileSchema).default([]),
	incoming: z.array(linkedProfileSchema).default([]),
	outgoing: z.array(linkedProfileSchema).default([]),
	/** Tier limit (entitlement `profile.links.max`); null = unlimited. */
	max: z.number().nullable().default(10),
});
export type MyProfileLinks = z.infer<typeof myLinksSchema>;

const statusResponseSchema = z.object({ status: linkStatusSchema });

export function createReputationMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	const getJson = async <T>(path: string, schema: z.ZodType<T>, errorKey: string): Promise<T> => {
		const response = await fetchRest(path, { method: "GET" });
		await assertSuccess(response, t(errorKey));
		return schema.parse(await parseJsonSafe(response));
	};
	const linkCall = async (path: string, method: string): Promise<ProfileLinkStatus> => {
		const response = await fetchRest(path, { method });
		await assertSuccess(response, t("profile_network.errors.link_failed"));
		return statusResponseSchema.parse(await parseJsonSafe(response)).status;
	};

	return {
		getProfileReputation(profileId: string): Promise<ProfileReputation> {
			return getJson(`/v1/profiles/${profileId}/reputation`, reputationSchema, "profile_network.errors.load_failed");
		},

		async setPersonallyKnown(profileId: string, known: boolean): Promise<void> {
			const response = await fetchRest(`/v1/profiles/${profileId}/known`, { method: known ? "PUT" : "DELETE" });
			await assertSuccess(response, t("profile_network.errors.known_failed"));
		},

		getProfileLinks(profileId: string): Promise<ProfileLinks> {
			return getJson(`/v1/profiles/${profileId}/links`, profileLinksSchema, "profile_network.errors.load_failed");
		},

		getMyProfileLinks(): Promise<MyProfileLinks> {
			return getJson("/v1/profiles/me/links", myLinksSchema, "profile_network.errors.load_failed");
		},

		/** Sends a link request (or confirms theirs if they asked first). */
		requestProfileLink(profileId: string): Promise<ProfileLinkStatus> {
			return linkCall(`/v1/profiles/${profileId}/link`, "POST");
		},

		acceptProfileLink(profileId: string): Promise<ProfileLinkStatus> {
			return linkCall(`/v1/profiles/${profileId}/link/accept`, "POST");
		},

		/** Unlinks, cancels the own request or declines theirs. */
		removeProfileLink(profileId: string): Promise<ProfileLinkStatus> {
			return linkCall(`/v1/profiles/${profileId}/link`, "DELETE");
		},
	};
}
