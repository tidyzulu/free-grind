import { z } from "zod";
import type { RestFetcher } from "../../types/chat-service";
import { ApiFunctionError, assertSuccess, parseJsonSafe } from "../apiHelpers";

/**
 * Cruising spots — Free Grind server extension (flag `cruising-spots`):
 * places on the grid map that users suggest and the community confirms by
 * vote, and the check-in that tells others you are at one right now.
 */

export const CRUISING_SPOTS_FLAG = "cruising-spots";

export const CRUISING_SPOT_CATEGORIES = ["park", "woods", "beach", "restroom", "parking", "rest_area", "sauna", "gym", "bar", "club", "cinema", "other"] as const;
export type CruisingSpotCategory = (typeof CRUISING_SPOT_CATEGORIES)[number];

export const CRUISING_NAME_MAX = 60;
export const CRUISING_DESCRIPTION_MAX = 500;

const spotSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable().default(null),
	// Unknown (newer) categories still show, with the generic icon.
	category: z.string().default("other"),
	status: z.enum(["pending", "approved", "rejected"]),
	lat: z.number(),
	lon: z.number(),
	mine: z.boolean().default(false),
	checkInCount: z.number().default(0),
	reviewNote: z.string().nullable().default(null),
	confirmations: z.number().default(0),
	rejections: z.number().default(0),
	myVote: z.enum(["confirm", "reject"]).nullable().default(null),
});
export type CruisingSpotVote = "confirm" | "reject";
export type CruisingSpot = z.infer<typeof spotSchema>;

const checkInSchema = z.object({ spotId: z.string(), checkedInAt: z.number(), expiresAt: z.number() }).nullable().default(null);
export type CruisingCheckIn = z.infer<typeof checkInSchema>;

const listSchema = z.object({
	spots: z.array(spotSchema).default([]),
	checkIn: checkInSchema,
	checkInRadiusMeters: z.number().default(300),
	checkInMinutes: z.number().default(120),
	canSuggest: z.boolean().default(true),
	confirmationsNeeded: z.number().default(3),
	rejectionsNeeded: z.number().default(3),
	/** 0 = voting from anywhere. */
	voteRadiusMeters: z.number().default(2000),
	/** Own preference: check in by itself after `autoCheckInMinutes` at a spot. */
	autoCheckIn: z.boolean().default(false),
	autoCheckInMinutes: z.number().default(10),
});
export type CruisingSpotList = z.infer<typeof listSchema>;

const prefsSchema = z.object({ autoCheckIn: z.boolean().default(false), autoCheckInMinutes: z.number().default(10) });
export type CruisingPrefs = z.infer<typeof prefsSchema>;

const checkedInProfileSchema = z.object({
	profileId: z.string(),
	displayName: z.string().nullable().default(null),
	primaryImageUrl: z.string().nullable().default(null),
	age: z.number().nullable().default(null),
	onlineUntil: z.number().nullable().default(null),
	checkedInAt: z.number(),
});
export type CheckedInProfile = z.infer<typeof checkedInProfileSchema>;

const detailSchema = z.object({
	spot: spotSchema,
	profiles: z.array(checkedInProfileSchema).default([]),
	checkIn: checkInSchema,
});
export type CruisingSpotDetail = z.infer<typeof detailSchema>;

export type CruisingSpotSuggestion = {
	name: string;
	description: string | null;
	category: CruisingSpotCategory;
	lat: number;
	lon: number;
};

/** The server's `reason` for a refused action (too_far, duplicate, …), if any. */
export function cruisingErrorReason(error: unknown): string | null {
	if (!(error instanceof ApiFunctionError)) return null;
	const payload = error.payload as { reason?: unknown } | null;
	return typeof payload?.reason === "string" ? payload.reason : null;
}

export function createCruisingMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	const json = async <T>(path: string, init: { method: string; body?: unknown }, schema: z.ZodType<T>): Promise<T> => {
		const response = await fetchRest(path, init);
		await assertSuccess(response, t("cruising.errors.generic"));
		return schema.parse(await parseJsonSafe(response));
	};

	return {
		/** Spots around `geohash` (approved ones plus the own suggestions under review). */
		getCruisingSpots(geohash: string): Promise<CruisingSpotList> {
			return json(`/v1/cruising/spots?geohash=${encodeURIComponent(geohash)}`, { method: "GET" }, listSchema);
		},

		getCruisingSpot(spotId: string): Promise<CruisingSpotDetail> {
			return json(`/v1/cruising/spots/${spotId}`, { method: "GET" }, detailSchema);
		},

		async suggestCruisingSpot(input: CruisingSpotSuggestion): Promise<CruisingSpot> {
			return (await json("/v1/cruising/spots", { method: "POST", body: input }, z.object({ spot: spotSchema }))).spot;
		},

		async withdrawCruisingSpot(spotId: string): Promise<void> {
			const response = await fetchRest(`/v1/cruising/spots/${spotId}`, { method: "DELETE" });
			await assertSuccess(response, t("cruising.errors.generic"));
		},

		/** `geohash`: the current device position; the server checks it against the spot. */
		async checkInAtCruisingSpot(spotId: string, geohash: string | null): Promise<CruisingCheckIn> {
			return (await json(`/v1/cruising/spots/${spotId}/check-in`, { method: "POST", body: { geohash } }, z.object({ checkIn: checkInSchema }))).checkIn;
		},

		/** Community review: confirm, reject or (null) take the own vote back. */
		async voteOnCruisingSpot(spotId: string, vote: CruisingSpotVote | null, geohash: string | null): Promise<CruisingSpot> {
			return (await json(`/v1/cruising/spots/${spotId}/vote`, { method: "POST", body: { vote, geohash } }, z.object({ spot: spotSchema }))).spot;
		},

		getCruisingPrefs(): Promise<CruisingPrefs> {
			return json("/v1/cruising/prefs", { method: "GET" }, prefsSchema);
		},

		async setCruisingAutoCheckIn(autoCheckIn: boolean): Promise<void> {
			const response = await fetchRest("/v1/cruising/prefs", { method: "PUT", body: { autoCheckIn } });
			await assertSuccess(response, t("cruising.errors.generic"));
		},

		async checkOutOfCruisingSpot(): Promise<void> {
			const response = await fetchRest("/v1/cruising/check-in", { method: "DELETE" });
			await assertSuccess(response, t("cruising.errors.generic"));
		},
	};
}
