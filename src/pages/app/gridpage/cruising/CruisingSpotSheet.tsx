import { ChevronRight, Loader2 } from "lucide-react";
import { Flag, HourglassMedium, NavigationArrow, SignIn, SignOut, TextAlignLeft, ThumbsDown, ThumbsUp, XCircle } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog";
import { NATIVE_SHEET_BG } from "../../../../components/ui/action-sheet";
import { SHEET_FOOTER_CLASS, SHEET_ICON_BUTTON_CLASS, SheetClose, SheetCloseButton, sheetButtonClass } from "../../../../components/ui/bottom-sheet";
import { ControlledBottomSheet } from "../../../../components/ui/controlled-sheet";
import { ProfileImage } from "../../../../components/ui/profile-image";
import { SHEET_GROUP_CLASS, SheetCard } from "../../../../components/ui/sheet-section";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { useCruisingCheckIn, useCruisingCheckOut, useCruisingSpot, useCruisingVote, useWithdrawCruisingSpot } from "../../../../hooks/queries/useCruisingQueries";
import { useDesktopBreakpoint } from "../../../../hooks/useDesktopBreakpoint";
import { cruisingErrorReason, type CruisingCheckIn, type CruisingSpot, type CruisingSpotVote } from "../../../../services/api/cruisingMethods";
import { cn } from "../../../../utils/cn";
import { decodeGeohash } from "../../../../utils/geohash";
import { hourCycleOptions } from "../../../../utils/timeFormat";
import { formatRelativeTime } from "../../../../utils/relativeTime";
import { formatDistance } from "../utils";
import { cruisingCategoryIcon } from "./cruisingCategories";

/** Great-circle distance in meters. */
export function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLon = (b.lon - a.lon) * rad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The own position from the stored geohash, or null. */
export function ownPosition(geohash: string | null): { lat: number; lon: number } | null {
	if (!geohash) return null;
	try {
		const { lat, lon } = decodeGeohash(geohash);
		return { lat: (lat[0] + lat[1]) / 2, lon: (lon[0] + lon[1]) / 2 };
	} catch {
		return null;
	}
}

/** Translated text for a refused cruising action. */
export function cruisingErrorText(error: unknown, t: (key: string, options?: Record<string, unknown>) => string, radiusMeters?: number): string {
	const reason = cruisingErrorReason(error);
	switch (reason) {
		case "too_far":
			return t("cruising.errors.too_far", { distance: radiusMeters ?? 300 });
		case "too_far_to_vote":
			return t("cruising.errors.too_far_to_vote", { distance: radiusMeters ?? 2000 });
		case "location_required":
		case "incognito":
		case "duplicate":
		case "too_many_pending":
		case "spot_not_found":
		case "already_approved":
		case "own_spot":
			return t(`cruising.errors.${reason}`);
		default:
			return error instanceof Error && error.message ? error.message : t("cruising.errors.generic");
	}
}

const ROW_TONES = {
	accent: "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]",
	danger: "bg-red-500/15 text-red-400",
	muted: "ink-tint-10 text-[var(--text-muted)]",
} as const;

/** One row of a native-group: icon tile, title with an optional value on the right, description below. */
function InfoRow({
	icon,
	tone = "muted",
	title,
	value,
	description,
	preserveLines = false,
	children,
}: {
	icon: ReactNode;
	tone?: keyof typeof ROW_TONES;
	title: string;
	value?: string;
	description?: string;
	/** Keep the description's line breaks (user text). */
	preserveLines?: boolean;
	children?: ReactNode;
}) {
	return (
		<div className="flex items-start gap-3 px-3 py-3">
			<div className={cn("shrink-0 rounded-2xl p-2.5", ROW_TONES[tone])}>{icon}</div>
			<div className="min-w-0 flex-1 pt-0.5">
				<div className="flex items-baseline justify-between gap-3">
					<span className="text-sm font-semibold leading-snug text-[var(--text)]">{title}</span>
					{value ? <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--text-muted)]">{value}</span> : null}
				</div>
				{description ? <p className={cn("mt-0.5 text-xs leading-snug text-[var(--text-muted)]", preserveLines && "whitespace-pre-wrap")}>{description}</p> : null}
				{children}
			</div>
		</div>
	);
}

type Props = {
	spotId: string | null;
	/** The spot as listed on the map, shown until its details arrived. */
	listed: CruisingSpot | null;
	myCheckIn: CruisingCheckIn;
	checkInRadiusMeters: number;
	checkInMinutes: number;
	/** Community review thresholds and the voting radius (0 = anywhere). */
	confirmationsNeeded: number;
	rejectionsNeeded: number;
	voteRadiusMeters: number;
	onClose: () => void;
	/** After the sheet closed (slid out, history entry popped). */
	onClosed?: () => void;
	onOpenProfile: (profileId: string) => void;
};

export function CruisingSpotSheet({ spotId, listed, myCheckIn, checkInRadiusMeters, checkInMinutes, confirmationsNeeded, rejectionsNeeded, voteRadiusMeters, onClose, onClosed, onOpenProfile }: Props) {
	const { t, i18n } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const { geohash, unitsPreset } = usePreferences();
	const { data } = useCruisingSpot(spotId);
	const checkIn = useCruisingCheckIn();
	const checkOut = useCruisingCheckOut();
	const withdraw = useWithdrawCruisingSpot();
	const vote = useCruisingVote();
	const [confirmWithdraw, setConfirmWithdraw] = useState(false);
	const [isReportOpen, setIsReportOpen] = useState(false);

	const spot = data?.spot ?? listed;
	const current = data ? data.checkIn : myCheckIn;
	const isHere = !!spot && current?.spotId === spot.id;
	const me = useMemo(() => ownPosition(geohash), [geohash]);
	const distance = spot && me ? metersBetween(me, spot) : null;
	const isNear = distance != null && distance <= checkInRadiusMeters;
	const busy = checkIn.isPending || checkOut.isPending || withdraw.isPending || vote.isPending;
	const canVoteHere = voteRadiusMeters <= 0 || (distance != null && distance <= voteRadiusMeters);
	const showVoting = !!spot && !spot.mine && spot.status !== "rejected";
	const Icon = cruisingCategoryIcon(spot?.category ?? "other");
	const profiles = data?.profiles ?? [];
	const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", ...hourCycleOptions() });

	const handleCheckIn = () => {
		if (!spot) return;
		checkIn.mutate(
			{ spotId: spot.id, geohash },
			{
				onSuccess: () => toast.success(t("cruising.checked_in_toast", { name: spot.name })),
				onError: (error) => toast.error(cruisingErrorText(error, t, checkInRadiusMeters)),
			},
		);
	};

	const handleCheckOut = () => {
		checkOut.mutate(undefined, {
			onSuccess: () => toast.success(t("cruising.checked_out_toast")),
			onError: (error) => toast.error(cruisingErrorText(error, t)),
		});
	};

	/** Tapping the own vote again takes it back. */
	const handleVote = (value: CruisingSpotVote, onDone?: () => void) => {
		if (!spot) return;
		const next = spot.myVote === value ? null : value;
		vote.mutate(
			{ spotId: spot.id, vote: next, geohash },
			{
				onSuccess: (updated) => {
					onDone?.();
					if (updated.status === "approved" && spot.status === "pending") toast.success(t("cruising.confirmed_toast", { name: updated.name }));
					else if (updated.status === "rejected") {
						toast.success(t("cruising.removed_toast"));
						onClose();
					} else if (next) toast.success(t("cruising.voted_toast"));
				},
				onError: (error) => toast.error(cruisingErrorText(error, t, voteRadiusMeters)),
			},
		);
	};

	const handleWithdraw = async () => {
		if (!spot) return;
		try {
			await withdraw.mutateAsync(spot.id);
			setConfirmWithdraw(false);
			toast.success(t("cruising.withdrawn_toast"));
			onClose();
		} catch (error) {
			toast.error(cruisingErrorText(error, t));
		}
	};

	const hasOtherCheckIn = !!current && !isHere;
	const isPending = spot?.status === "pending";
	const isApproved = spot?.status === "approved";
	const progress = Math.min(1, (spot?.confirmations ?? 0) / Math.max(1, confirmationsNeeded));

	return (
		<>
			<ControlledBottomSheet
				isOpen={!!spotId}
				onDismiss={onClose}
				onClosed={onClosed}
				isDesktop={isDesktop}
				isProcessing={busy}
				bg={NATIVE_SHEET_BG}
				panelClassName="max-h-[88dvh] px-4"
			>
				{/* Header like the app's other sheets: the spot's circle (as on the map), name, status · type · distance. */}
				<div className="mb-3 flex shrink-0 items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<div
							className={cn(
								"flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent)]",
								isHere ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--surface-2)] text-[var(--accent)]",
								isPending && "border-dashed",
							)}
						>
							<Icon weight="fill" className="h-5 w-5" />
						</div>
						<div className="min-w-0">
							<h3 className="truncate text-sm font-semibold text-[var(--text)]">{spot?.name ?? "…"}</h3>
							<p className="truncate text-xs text-[var(--text-muted)]">
								{[
									isPending ? t("cruising.status_unconfirmed") : null,
									spot ? t(`cruising.categories.${spot.category}`, { defaultValue: spot.category }) : null,
									distance != null ? formatDistance(distance, t, unitsPreset) : null,
								]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{isApproved && showVoting ? (
							<button
								type="button"
								onClick={() => setIsReportOpen(true)}
								title={t("cruising.report_title")}
								aria-label={t("cruising.report_title")}
								className={cn(SHEET_ICON_BUTTON_CLASS, spot?.myVote === "reject" && "!text-red-400")}
							>
								<Flag weight="fill" className="h-4 w-4" />
							</button>
						) : null}
						<SheetCloseButton disabled={busy} />
					</div>
				</div>

				<div className="-mx-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-3" data-lenis-prevent>
					{spot ? (
						<div className={SHEET_GROUP_CLASS}>
							{isHere && current ? (
								<InfoRow
									icon={<SignIn weight="fill" className="h-5 w-5" />}
									tone="accent"
									title={t("cruising.you_are_here_title")}
									description={t("cruising.you_are_here_hint", { time: timeOf(current.expiresAt) })}
								/>
							) : null}

							{isPending ? (
								<InfoRow
									icon={<HourglassMedium weight="fill" className="h-5 w-5" />}
									tone="accent"
									title={t(spot.mine ? "cruising.vote_title_mine" : "cruising.vote_title_pending")}
									value={t("cruising.confirmations_progress", { count: spot.confirmations, needed: confirmationsNeeded })}
									description={
										showVoting && !canVoteHere
											? t("cruising.vote_too_far_hint", { distance: formatDistance(voteRadiusMeters, t, unitsPreset) })
											: t(spot.mine ? "cruising.pending_hint_mine_short" : "cruising.pending_hint_short")
									}
								>
									<div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--text)]/10">
										<div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
									</div>
								</InfoRow>
							) : null}

							{spot.status === "rejected" ? (
								<InfoRow
									icon={<XCircle weight="fill" className="h-5 w-5" />}
									tone="danger"
									title={t("cruising.rejected_title")}
									description={spot.reviewNote ?? undefined}
								/>
							) : null}

							{spot.description ? (
								<InfoRow icon={<TextAlignLeft weight="bold" className="h-5 w-5" />} title={t("cruising.about_place")} description={spot.description} preserveLines />
							) : null}

							{isApproved && !isHere ? (
								<InfoRow
									icon={<NavigationArrow weight="fill" className="h-5 w-5" />}
									tone={isNear ? "accent" : "muted"}
									title={t(isNear ? "cruising.in_range_title" : "cruising.out_of_range_title")}
									description={
										(isNear
											? t("cruising.check_in_hint", { minutes: checkInMinutes })
											: t("cruising.too_far_hint", { distance: formatDistance(checkInRadiusMeters, t, unitsPreset) })) +
										(hasOtherCheckIn ? ` ${t("cruising.switch_hint")}` : "")
									}
								/>
							) : null}
						</div>
					) : null}

					{/* Confirmed: who's here right now, as a user list (hidden while nobody is). */}
					{isApproved && profiles.length > 0 ? (
						<section>
							<p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								{t("cruising.here_now")}
								<span className="ms-1.5 tabular-nums">{profiles.length}</span>
							</p>
							<div className={SHEET_GROUP_CLASS}>
								{profiles.map((p) => {
										const name = p.displayName?.trim() || t("common.unknown_display_name");
										const online = p.onlineUntil != null && p.onlineUntil > Date.now();
										return (
											<button
												key={p.profileId}
												type="button"
												onClick={() => onOpenProfile(p.profileId)}
												className="hover-fill flex w-full items-center gap-3 px-3 py-3 text-start transition-colors"
											>
												<span className="relative h-10 w-10 shrink-0">
													<span className="block h-full w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
														<ProfileImage className="bg-slate-500/15 text-slate-400" src={p.primaryImageUrl} alt={t("profile_details.photo_alt", { name })} />
													</span>
													{online ? <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface)] bg-green-500" /> : null}
												</span>
												<span className="min-w-0 flex-1">
													<span className="block truncate text-sm font-semibold leading-snug text-[var(--text)]">
														{name}
														{p.age != null ? `, ${p.age}` : ""}
													</span>
													<span className="mt-0.5 block truncate text-xs leading-snug text-[var(--text-muted)]">
														{t("cruising.checked_in_ago", { time: formatRelativeTime(p.checkedInAt, Date.now(), "short") })}
													</span>
												</span>
												<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] rtl:rotate-180" />
											</button>
										);
								})}
							</div>
						</section>
					) : null}
				</div>

				{spot && (isApproved || spot.mine || showVoting) ? (
					<div className={SHEET_FOOTER_CLASS}>
						{isApproved ? (
							isHere ? (
								<button type="button" disabled={busy} onClick={handleCheckOut} className={sheetButtonClass("secondary")}>
									{checkOut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SignOut weight="bold" className="h-4 w-4" />}
									<span className="truncate">{t("cruising.check_out")}</span>
								</button>
							) : (
								<button type="button" disabled={busy || !isNear} onClick={handleCheckIn} className={sheetButtonClass()}>
									{checkIn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SignIn weight="bold" className="h-4 w-4" />}
									<span className="truncate">{t("cruising.check_in")}</span>
								</button>
							)
						) : spot.mine ? (
							<button type="button" disabled={busy} onClick={() => setConfirmWithdraw(true)} className={sheetButtonClass("secondary")}>
								<span className="truncate">{t(spot.status === "rejected" ? "cruising.remove_suggestion" : "cruising.withdraw")}</span>
							</button>
						) : (
							// Unconfirmed spot of someone else: the vote, as the sheet's actions. Tapping the own vote again takes it back.
							<>
								<button
									type="button"
									disabled={busy || !canVoteHere}
									onClick={() => handleVote("reject")}
									aria-pressed={spot.myVote === "reject"}
									className={cn(sheetButtonClass("secondary"), spot.myVote === "reject" && "!bg-red-500 !text-white")}
								>
									<ThumbsDown weight="fill" className="h-4 w-4" />
									<span className="truncate">{t("cruising.vote_reject")}</span>
								</button>
								<button
									type="button"
									disabled={busy || !canVoteHere}
									onClick={() => handleVote("confirm")}
									aria-pressed={spot.myVote === "confirm"}
									className={sheetButtonClass(spot.myVote === "confirm" ? "primary" : "accent")}
								>
									{vote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp weight="fill" className="h-4 w-4" />}
									<span className="truncate">{t("cruising.vote_confirm")}</span>
								</button>
							</>
						)}
					</div>
				) : null}
			</ControlledBottomSheet>
			{/* Reporting a confirmed spot that's gone: a "doesn't exist" vote in its own sheet. */}
			<ControlledBottomSheet
				isOpen={isReportOpen && !!spot && isApproved && showVoting}
				onDismiss={() => setIsReportOpen(false)}
				isDesktop={isDesktop}
				isProcessing={vote.isPending}
				bg={NATIVE_SHEET_BG}
				panelClassName="max-h-[80dvh] px-4"
			>
				<div className="mb-3 flex shrink-0 items-center justify-between gap-3">
					<h3 className="text-sm font-semibold text-[var(--text)]">{t("cruising.report_title")}</h3>
					<SheetCloseButton disabled={vote.isPending} />
				</div>
				{spot ? (
					<div className="-mx-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3" data-lenis-prevent>
						<p className="px-1 text-sm leading-relaxed text-[var(--text-muted)]">{t("cruising.report_text", { name: spot.name, needed: rejectionsNeeded })}</p>
						<SheetCard className="flex items-center justify-between gap-3 text-sm">
							<span className="text-[var(--text-muted)]">{t("cruising.report_count_label")}</span>
							<span className="font-semibold tabular-nums text-[var(--text)]">
								{spot.rejections} / {rejectionsNeeded}
							</span>
						</SheetCard>
						{spot.myVote === "reject" ? <p className="px-1 text-xs text-[var(--text-muted)]">{t("cruising.report_done")}</p> : null}
						{!canVoteHere && spot.myVote !== "reject" ? (
							<p className="px-1 text-xs text-[var(--text-muted)]">{t("cruising.vote_too_far_hint", { distance: formatDistance(voteRadiusMeters, t, unitsPreset) })}</p>
						) : null}
					</div>
				) : null}
				<div className={SHEET_FOOTER_CLASS}>
					<SheetClose disabled={vote.isPending} className={sheetButtonClass("secondary")}>
						{t("common.cancel")}
					</SheetClose>
					{spot?.myVote === "reject" ? (
						<button type="button" disabled={vote.isPending} onClick={() => handleVote("reject", () => setIsReportOpen(false))} className={sheetButtonClass("secondary")}>
							{vote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
							<span className="truncate">{t("cruising.report_undo_action")}</span>
						</button>
					) : (
						<button
							type="button"
							disabled={vote.isPending || !canVoteHere}
							onClick={() => handleVote("reject", () => setIsReportOpen(false))}
							className={cn(sheetButtonClass(), "!bg-red-500 !text-white")}
						>
							{vote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag weight="fill" className="h-4 w-4" />}
							<span className="truncate">{t("cruising.report_action_gone")}</span>
						</button>
					)}
				</div>
			</ControlledBottomSheet>
			<ConfirmDialog
				isOpen={confirmWithdraw}
				title={t("cruising.withdraw_confirm_title")}
				message={t("cruising.withdraw_confirm_message")}
				confirmLabel={t("cruising.withdraw")}
				cancelLabel={t("common.cancel")}
				onConfirm={() => void handleWithdraw()}
				onCancel={() => setConfirmWithdraw(false)}
				isProcessing={withdraw.isPending}
				confirmTone="danger"
			/>
		</>
	);
}
