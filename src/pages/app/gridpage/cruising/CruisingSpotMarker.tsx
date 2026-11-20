import { Clock, UsersThree } from "@phosphor-icons/react";
import type { CruisingSpot } from "../../../../services/api/cruisingMethods";
import { cruisingCategoryIcon } from "./cruisingCategories";

/**
 * Map marker of a cruising spot, rendered (via a portal) into the MapLibre
 * marker element. Same circle as a profile marker (accent ring, shadow), with
 * the category icon instead of a photo; filled with the accent where you're
 * checked in. A badge counts the people there, with a soft pulse while anyone
 * is. Suggestions the community hasn't confirmed yet get a dashed ring.
 */
export function CruisingSpotMarker({ spot, label, isCheckedIn }: { spot: CruisingSpot; label: string; isCheckedIn: boolean }) {
	const Icon = cruisingCategoryIcon(spot.category);
	const pending = spot.status !== "approved";
	const active = !pending && spot.checkInCount > 0;
	return (
		<div className="rn-marker-pop">
			<div className="rn-marker-inner">
				{active ? <span aria-hidden="true" className="cruising-pulse absolute inset-0 rounded-full border-[var(--accent)]" /> : null}
				<div
					className={
						"absolute inset-0 flex items-center justify-center overflow-hidden rounded-full border-2 border-[var(--accent)] shadow-[0_4px_12px_rgba(0,0,0,0.35)] " +
						(isCheckedIn ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--surface-2)] text-[var(--accent)]") +
						(pending ? " border-dashed opacity-90" : "")
					}
				>
					<Icon weight="fill" className="h-[22px] w-[22px]" />
				</div>
				{active ? (
					<span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border-2 border-[var(--bg)] bg-[var(--accent)] px-1 text-[10px] font-bold tabular-nums text-[var(--accent-contrast)]">
						<UsersThree weight="fill" className="h-2.5 w-2.5" />
						{spot.checkInCount > 99 ? "99+" : spot.checkInCount}
					</span>
				) : pending ? (
					<span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--bg)] bg-[var(--surface)] text-[var(--text-muted)]">
						<Clock weight="fill" className="h-3 w-3" />
					</span>
				) : null}
				<div className="rn-nameplate">{label}</div>
			</div>
		</div>
	);
}
