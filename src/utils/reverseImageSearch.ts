import { openUrl } from "@tauri-apps/plugin-opener";
import { appLog } from "./logger";

export type ReverseImageSearchEngine = "google" | "yandex";

export const REVERSE_IMAGE_SEARCH_ENGINES: ReverseImageSearchEngine[] = ["google", "yandex"];

/**
 * Reverse image search runs on the engine's side, which fetches the picture
 * itself — so only a public http(s) URL works (not blob:, data: or the local
 * fgmedia proxy). Returns null for anything else.
 */
export function getReverseSearchableUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
		if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

export function buildReverseImageSearchUrl(engine: ReverseImageSearchEngine, imageUrl: string): string {
	const encoded = encodeURIComponent(imageUrl);
	switch (engine) {
		case "google":
			return `https://lens.google.com/uploadbyurl?url=${encoded}`;
		case "yandex":
			return `https://yandex.com/images/search?rpt=imageview&url=${encoded}`;
	}
}

/** Opens the engine's results for `imageUrl` in the system browser (fake-profile check). */
export async function openReverseImageSearch(engine: ReverseImageSearchEngine, imageUrl: string): Promise<void> {
	const url = buildReverseImageSearchUrl(engine, imageUrl);
	try {
		await openUrl(url);
	} catch (error) {
		appLog.warn("openUrl failed for reverse image search, falling back to window.open", error);
		window.open(url, "_blank", "noopener,noreferrer");
	}
}
