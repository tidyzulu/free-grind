import type { GrindrWorkaround } from "../types";

/**
 * Grindr marks some profiles as not blockable (`isBlockable: false`); the
 * official app then offers no block. Free Grind blocks them anyway.
 */
export const blockAnyProfile: GrindrWorkaround = {
	id: "block-any-profile",
	allowBlockingAnyProfile: true,
};
