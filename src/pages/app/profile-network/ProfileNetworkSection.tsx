import { useState } from "react";
import { ChevronRight, Link2, ShieldCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/useAuth";
import {
	useMyProfileLinks,
	useProfileLinks,
	useProfileReputation,
	useProfileReputationEnabled,
} from "../../../hooks/queries/useReputationQueries";
import type { ProfileReputation } from "../../../services/api/reputationMethods";
import { ProfileImage } from "../../../components/ui/profile-image";
import { NATIVE_SHEET_BG } from "../../../components/ui/action-sheet";
import { SheetCloseButton } from "../../../components/ui/bottom-sheet";
import { ControlledBottomSheet } from "../../../components/ui/controlled-sheet";
import { useDesktopBreakpoint } from "../../../hooks/useDesktopBreakpoint";
import { LinkedProfileRow } from "./LinkedProfileRow";
import { getThumbImageUrl, validateMediaHash } from "../../../utils/media";

const SECTION_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]";
/** From this many links on, the strip gets a "Show all" sheet. */
const SHOW_ALL_FROM = 4;

/** The five-step index as dots, filled up to the level. */
function ReputationLevelDots({ level }: { level: number }) {
	return (
		<span className="flex items-center gap-1" aria-hidden>
			{Array.from({ length: 5 }, (_, i) => (
				<span key={i} className={`h-1.5 w-1.5 rounded-full ${i < level ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
			))}
		</span>
	);
}

/**
 * The reputation index as plain icon rows, in the style of the profile's
 * stats and account info. The "personally known" mark itself is set from the
 * profile's actions menu (useProfileNetworkMenu).
 */
export function ReputationSummary({ reputation }: { reputation: ProfileReputation }) {
	const { t } = useTranslation();
	const score = reputation.score.toLocaleString(undefined, { maximumFractionDigits: 1 });
	const rows: string[] = [];
	if (reputation.knownByCount > 0) {
		rows.push(t("profile_network.known_by", { count: reputation.knownByCount }));
		rows.push(t("profile_network.known_by_vouched", { count: reputation.knownByVouchedCount }));
	} else {
		rows.push(t("profile_network.known_by_none"));
	}

	return (
		<div className="space-y-2.5">
			{reputation.knownByCount > 0 && (
				<div className="flex items-center gap-2.5">
					<ShieldCheck className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
					<p className="text-sm text-[var(--text-muted)]">{t("profile_network.level_line", { level: t(`profile_network.level.${reputation.level}`), score })}</p>
					<ReputationLevelDots level={reputation.level} />
				</div>
			)}
			{rows.map((text) => (
				<div key={text} className="flex items-center gap-2.5">
					<Users className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
					<p className="text-sm text-[var(--text-muted)]">{text}</p>
				</div>
			))}
		</div>
	);
}

/**
 * Below the Spotify songs: the profiles linked to this one (only when there
 * are any) and its reputation index (Free Grind server, flag
 * `profile-reputation`). Link requests and the "personally known" mark live in
 * the profile's actions menu; on the own profile, the open requests row opens
 * the editor's linked profiles section (`onManage`), where links are managed.
 */
export function ProfileNetworkSection({
	profileId,
	isPreview = false,
	onManage,
}: {
	profileId: string;
	isPreview?: boolean;
	onManage?: () => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const { userId } = useAuth();
	const enabled = useProfileReputationEnabled();
	const isOwnProfile = userId != null && String(userId) === String(profileId);
	const active = enabled && !isPreview && !!profileId;
	const { data: reputation } = useProfileReputation(profileId, active);
	const { data: links } = useProfileLinks(profileId, active);
	const { data: myLinks } = useMyProfileLinks(active && isOwnProfile);
	const isDesktop = useDesktopBreakpoint();
	const [isAllOpen, setIsAllOpen] = useState(false);
	// Opened from the sheet: navigate once it slid out and popped its history entry.
	const [openAfterClose, setOpenAfterClose] = useState<string | null>(null);

	const linkedProfiles = links?.links ?? [];
	const incomingCount = isOwnProfile ? (myLinks?.incoming.length ?? 0) : 0;
	const showLinks = linkedProfiles.length > 0 || incomingCount > 0;
	// Nothing loaded (yet), or a failed request: no empty block that would still take the parent's gap.
	if (!active || (!showLinks && !reputation)) return null;

	// The opening profile stays directly below in history (`stacked`), so closing
	// pops back to it with its own state (returnTo, swipe list) intact. On desktop
	// the linked profile keeps the same background page under the modal.
	const backgroundLocation = (location.state as { backgroundLocation?: unknown } | null)?.backgroundLocation;
	const openProfile = (id: string) => {
		if (String(id) === String(profileId)) return;
		navigate(`/profile/${id}`, {
			state: { returnTo: location.pathname, stacked: true, ...(backgroundLocation ? { backgroundLocation } : {}) },
		});
	};

	return (
		<>
			{showLinks && (
				<div className="px-3">
					<div className="mb-2 flex min-h-5 items-center justify-between gap-3">
						<p className={SECTION_LABEL_CLASS}>
							{t("profile_network.linked_profiles")}
							{linkedProfiles.length > 0 && <span className="ms-1.5 tabular-nums">{linkedProfiles.length}</span>}
						</p>
						{linkedProfiles.length >= SHOW_ALL_FROM && (
							<button
								type="button"
								onClick={() => setIsAllOpen(true)}
								className="-my-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-[var(--accent-readable)] transition active:opacity-60"
							>
								{t("profile_network.show_all")}
							</button>
						)}
					</div>
					{/* One row of tiles, scrolled sideways and bled to the edges; the
					    profile pager leaves its drags alone (data-no-profile-swipe). */}
					{linkedProfiles.length > 0 && (
						<div
							data-no-profile-swipe
							data-lenis-prevent
							className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						>
							{linkedProfiles.map((profile) => {
								const name = profile.displayName?.trim() || t("common.unknown_display_name");
								const avatarUrl = profile.primaryMediaHash && validateMediaHash(profile.primaryMediaHash) ? getThumbImageUrl(profile.primaryMediaHash, "320x320") : null;
								return (
									<button
										key={profile.profileId}
										type="button"
										onClick={() => openProfile(profile.profileId)}
										className="group w-[6.5rem] shrink-0 snap-start text-start sm:w-28"
									>
										{/* Name inside the tile, like the grid: white on a bottom gradient. */}
										<span className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-[var(--surface-2)]">
											<ProfileImage src={avatarUrl} alt={t("profile_details.photo_alt", { name })} placeholder="silhouette" />
											<span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
											<span className="absolute inset-x-2 bottom-1.5 truncate text-xs font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{name}</span>
											{/* Border inside the tile, over the photo: an outer ring would be
											    clipped by the scroller (overflow-x also clips vertically). */}
											<span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[var(--border)] transition group-hover:ring-2 group-hover:ring-[var(--accent)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent)]" />
										</span>
									</button>
								);
							})}
						</div>
					)}
					{incomingCount > 0 && onManage && (
						<button
							type="button"
							onClick={onManage}
							className={`flex min-h-12 w-full items-center gap-3 rounded-2xl bg-[var(--surface-2)] px-4 text-start transition hover-fill [--hover-base:var(--surface-2)] ${linkedProfiles.length > 0 ? "mt-3" : ""}`}
						>
							<Link2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
							<span className="min-w-0 flex-1 text-[15px] text-[var(--text)]">{t("profile_network.open_requests", { count: incomingCount })}</span>
							<span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--accent-contrast)]">{incomingCount}</span>
							<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] rtl:rotate-180" />
						</button>
					)}
				</div>
			)}

			<ControlledBottomSheet
				isOpen={isAllOpen}
				onDismiss={() => setIsAllOpen(false)}
				onClosed={() => {
					if (openAfterClose) openProfile(openAfterClose);
					setOpenAfterClose(null);
				}}
				expandable={linkedProfiles.length > 6}
				isDesktop={isDesktop}
				bg={NATIVE_SHEET_BG}
				panelClassName={isDesktop ? "max-h-[85dvh] px-4" : "px-4"}
			>
				<div className="mb-3 flex shrink-0 items-center justify-between gap-3">
					<p className="text-base font-semibold text-[var(--text)]">
						{t("profile_network.linked_profiles")}
						<span className="ms-1.5 tabular-nums text-[var(--text-muted)]">{linkedProfiles.length}</span>
					</p>
					<SheetCloseButton />
				</div>
				<div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-2" data-lenis-prevent>
					<div className="native-group">
						{linkedProfiles.map((profile) => (
							<LinkedProfileRow
								key={profile.profileId}
								profile={profile}
								subtitle={profile.since ? t("profile_network.linked_since", { date: new Date(profile.since).toLocaleDateString() }) : undefined}
								onOpen={(id) => {
									setOpenAfterClose(id);
									setIsAllOpen(false);
								}}
							/>
						))}
					</div>
				</div>
			</ControlledBottomSheet>

			{reputation && (
				<div className="px-3">
					<p className={`mb-2 ${SECTION_LABEL_CLASS}`}>{t("profile_network.reputation")}</p>
					<ReputationSummary reputation={reputation} />
				</div>
			)}
		</>
	);
}
