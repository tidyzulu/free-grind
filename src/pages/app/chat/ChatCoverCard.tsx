import type { ReactNode } from "react";
import { cn } from "../../../utils/cn";

/** Top-start pill on a media card (album, shared profile, requests). */
export function MediaBadge({ icon, label }: { icon: ReactNode; label: ReactNode }) {
	return (
		<div className="pointer-events-none absolute start-2 top-2 z-20 inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/50 ps-1.5 pe-2.5 text-[11px] font-semibold leading-none text-white [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.3)] backdrop-blur-md">
			{icon}
			{label}
		</div>
	);
}

/**
 * Button on a request card, without outline like the app's other buttons.
 * `primary`: accent; otherwise glass on a cover, a tinted fill on a compact card.
 */
export function cardButtonClass({ primary = false, onCover }: { primary?: boolean; onCover: boolean }): string {
	return cn(
		"inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-50",
		primary
			? "bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110"
			: onCover
				? "bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
				: "ink-tint-10 text-[var(--text)] hover:ink-tint-14",
	);
}

type CardContent = {
	title: ReactNode;
	text?: ReactNode;
	/** Small line with a dot, bottom start (next to the time). */
	status?: ReactNode;
	/** Buttons, one full-width row (equal widths). */
	actions?: ReactNode[];
	/** Time / menu, bottom end. Inherits the text color. */
	meta: ReactNode;
	tailCorner: string;
};

function ActionsRow({ actions }: { actions?: ReactNode[] }) {
	if (!actions?.length) return null;
	return <div className={cn("grid gap-2", actions.length > 1 ? "grid-cols-2" : "grid-cols-1")}>{actions}</div>;
}

function BottomRow({ status, meta, className }: { status?: ReactNode; meta: ReactNode; className: string }) {
	return (
		<div className={cn("flex items-center justify-between gap-2 text-[11px]", className)}>
			<span className="flex min-w-0 items-center gap-1.5 truncate">{status}</span>
			<span className="shrink-0 text-[10px]">{meta}</span>
		</div>
	);
}

/**
 * A request card with a photo, laid out like the album and shared-profile
 * cards: the cover fills it, a badge sits top-start, text and buttons sit on a
 * dark gradient at the bottom.
 */
export function ChatCoverCard({ cover, badge, title, text, status, actions, meta, tailCorner }: CardContent & { cover: ReactNode; badge: ReactNode }) {
	return (
		<div className={cn("relative isolate flex min-h-60 w-64 max-w-full flex-col justify-end overflow-hidden rounded-2xl bg-[var(--surface-2)] [mask-image:radial-gradient(white,black)] sm:w-72", tailCorner)}>
			<div className="absolute inset-0">{cover}</div>
			{badge}
			<div className="relative z-20 flex flex-col gap-2 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3 pb-2 pt-10 text-white">
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold leading-tight drop-shadow">{title}</p>
					{text ? <p className="mt-0.5 line-clamp-2 break-words text-xs text-white/85">{text}</p> : null}
				</div>
				<ActionsRow actions={actions} />
				<BottomRow status={status} meta={meta} className="text-white/75" />
			</div>
		</div>
	);
}

/**
 * The same request card without a photo: a tinted surface card with an icon
 * circle in `tint` (a CSS color) instead of an empty cover.
 */
export function ChatCompactCard({ icon, tint, title, text, status, actions, meta, tailCorner }: CardContent & { icon: ReactNode; tint: string }) {
	return (
		<div
			className={cn("flex w-64 max-w-full flex-col gap-3 rounded-2xl p-3 text-[var(--text)] sm:w-72", tailCorner)}
			style={{ background: `color-mix(in srgb, ${tint} 12%, var(--surface-2))` }}
		>
			<div className="flex items-start gap-3">
				<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white [&>svg]:h-5 [&>svg]:w-5" style={{ background: tint }}>
					{icon}
				</span>
				<div className="min-w-0 flex-1 pt-0.5">
					<p className="truncate text-sm font-semibold leading-tight">{title}</p>
					{text ? <p className="mt-0.5 break-words text-xs leading-snug text-[var(--text-muted)]">{text}</p> : null}
				</div>
			</div>
			<ActionsRow actions={actions} />
			<BottomRow status={status} meta={meta} className="-mt-1 text-[var(--text-muted)]" />
		</div>
	);
}
