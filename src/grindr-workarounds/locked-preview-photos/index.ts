import type { GrindrWorkaround } from "../types";

/**
 * Locked "viewed me" previews carry the viewer's photo hash; the official app
 * blurs that photo, Free Grind shows it as is.
 */
export const lockedPreviewPhotos: GrindrWorkaround = {
	id: "locked-preview-photos",
	showLockedPreviewPhotos: true,
};
