import { z } from "zod";
import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess, parseJsonSafe } from "../apiHelpers";

/**
 * Free Grind server extension: the own position on the grid map as others
 * see it (the obfuscated public point) and the randomizer radius it was
 * drawn from. Official servers don't have it.
 */

const ownMapPositionSchema = z.object({
	/** Shown on the map to others (show on map, not incognito). */
	visible: z.boolean().default(false),
	lat: z.number().nullable().default(null),
	lon: z.number().nullable().default(null),
	radiusMeters: z.number().default(0),
});
export type OwnMapPosition = z.infer<typeof ownMapPositionSchema>;

export function createOwnMapPositionMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		async getOwnMapPosition(): Promise<OwnMapPosition> {
			const response = await fetchRest("/v1/me/map-position", { method: "GET" });
			await assertSuccess(response, t("cruising.errors.generic"));
			return ownMapPositionSchema.parse(await parseJsonSafe(response));
		},
	};
}
