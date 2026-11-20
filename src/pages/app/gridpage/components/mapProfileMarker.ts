import type { ProfilePhotoPrivacy } from "../../../../hooks/useProfilePhotoPrivacy";
import type { BrowseCard } from "../../../../types/grid";
import { proxyMediaUrl } from "../../../../utils/mediaProxy";

/**
 * The round profile marker of the grid map (photo in an accent ring, online
 * dot, name plate), as plain DOM for a MapLibre marker. Also draws the own
 * profile on the grid and Right Now maps. Styles: .rn-* in index.css.
 */

export const PROFILE_MARKER_SIZE = 44;
const USER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.76-3.58-5-8-5Z"/></svg>`;

export function isCardOnline(card: Pick<BrowseCard, "onlineUntil">): boolean {
	return typeof card.onlineUntil === "number" && card.onlineUntil > Date.now();
}

export function buildProfileMarker(
	card: Pick<BrowseCard, "primaryImageUrl" | "onlineUntil">,
	label: string,
	privacy: ProfilePhotoPrivacy,
	onClick: (() => void) | null,
	extraClass = "",
): HTMLDivElement {
	const el = document.createElement("div");
	el.className = extraClass ? `rn-marker ${extraClass}` : "rn-marker";
	el.style.cssText = `width:${PROFILE_MARKER_SIZE}px;height:${PROFILE_MARKER_SIZE}px;${onClick ? "cursor:pointer;" : ""}`;
	const pop = document.createElement("div");
	pop.className = "rn-marker-pop";
	const inner = document.createElement("div");
	inner.className = "rn-marker-inner";
	const avatar = document.createElement("div");
	avatar.style.cssText =
		"position:absolute;inset:0;border-radius:9999px;border:2px solid var(--accent);background:var(--surface-2);color:var(--text-muted);box-shadow:0 4px 12px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;overflow:hidden;";
	if (card.primaryImageUrl && privacy !== "hide") {
		const img = document.createElement("img");
		img.src = proxyMediaUrl(card.primaryImageUrl);
		img.alt = "";
		img.draggable = false;
		img.style.cssText = `width:100%;height:100%;object-fit:cover;${privacy === "blur" ? "filter:blur(6px);transform:scale(1.1);" : ""}`;
		avatar.appendChild(img);
	} else {
		avatar.innerHTML = USER_ICON_SVG;
	}
	inner.appendChild(avatar);
	if (isCardOnline(card)) {
		const dot = document.createElement("div");
		dot.style.cssText = "position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:9999px;background:#22c55e;border:2px solid var(--bg);";
		inner.appendChild(dot);
	}
	if (label) {
		const plate = document.createElement("div");
		plate.className = "rn-nameplate";
		plate.textContent = label;
		inner.appendChild(plate);
	}
	pop.appendChild(inner);
	el.appendChild(pop);
	if (onClick) {
		el.addEventListener("click", (event) => {
			event.stopPropagation();
			onClick();
		});
	}
	return el;
}
