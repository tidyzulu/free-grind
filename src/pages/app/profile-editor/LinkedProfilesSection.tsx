import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Link2, Loader2, Unlink, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import {
	type ProfileLinkAction,
	useMyProfileLinks,
	useProfileLinkAction,
	useProfileReputationEnabled,
} from "../../../hooks/queries/useReputationQueries";
import type { LinkedProfile } from "../../../services/api/reputationMethods";
import { haptic } from "../../../utils/haptics";
import { LinkedProfileRow, linkPillClass } from "../profile-network/LinkedProfileRow";
import { linkErrorMessage } from "../profile-network/linkErrorMessage";
import { FieldSection } from "./ProfileFieldRows";

/**
 * The own linked profiles in the profile editor (Free Grind server, flag
 * `profile-reputation`): open requests to confirm or decline, confirmed links,
 * sent requests. Unlike the draft sections, every action is saved right away.
 * New requests are sent from the other profile's menu ("Link with my profile").
 */
export function LinkedProfilesSection({ scrollIntoView = false }: { scrollIntoView?: boolean }) {
	const enabled = useProfileReputationEnabled();
	if (!enabled) return null;
	return <LinkedProfilesSectionContent scrollIntoView={scrollIntoView} />;
}

function LinkedProfilesSectionContent({ scrollIntoView }: { scrollIntoView: boolean }) {
	const { t } = useTranslation();
	const { data, isLoading, error, refetch } = useMyProfileLinks();
	const linkAction = useProfileLinkAction();
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [unlinkTarget, setUnlinkTarget] = useState<LinkedProfile | null>(null);
	const sectionRef = useRef<HTMLDivElement>(null);

	// Opened from the profile's open link requests row: scroll here once.
	useEffect(() => {
		if (scrollIntoView) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, [scrollIntoView]);

	const run = (profile: LinkedProfile, action: ProfileLinkAction) => {
		haptic(10);
		setPendingId(profile.profileId);
		linkAction.mutate(
			{ profileId: profile.profileId, action },
			{
				onSuccess: () => {
					if (action === "accept") toast.success(t("profile_network.linked_toast"));
					setUnlinkTarget(null);
				},
				onError: (err) => toast.error(linkErrorMessage(err, t)),
				onSettled: () => setPendingId(null),
			},
		);
	};

	const links = data?.links ?? [];
	const incoming = data?.incoming ?? [];
	const outgoing = data?.outgoing ?? [];
	const max = data?.max ?? null;
	const spinnerOr = (profile: LinkedProfile, icon: ReactNode) =>
		pendingId === profile.profileId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon;

	const hint = <p className="mt-2 px-1 text-xs leading-relaxed text-[var(--text-muted)]">{t("profile_network.how_to_link")}</p>;
	const count = (
		<span className="rounded-full ink-tint-10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
			{max == null ? links.length : `${links.length}/${max}`}
		</span>
	);

	let body: ReactNode;
	if (isLoading) {
		body = (
			<div className="flex min-h-14 items-center justify-center text-[var(--text-muted)]">
				<Loader2 className="h-5 w-5 animate-spin" />
			</div>
		);
	} else if (error) {
		body = (
			<button type="button" onClick={() => void refetch()} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-start hover-fill">
				<span className="flex-1 text-sm text-[var(--text-muted)]">{t("profile_network.errors.load_failed")}</span>
				<span className="text-sm font-semibold text-[var(--accent-readable)]">{t("profile_network.retry")}</span>
			</button>
		);
	} else if (links.length + incoming.length + outgoing.length === 0) {
		body = (
			<div className="flex items-center gap-3 p-3 pe-4">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ink-tint-8 text-[var(--text-muted)]">
					<Link2 className="h-4 w-4" />
				</span>
				<span className="text-sm text-[var(--text-muted)]">{t("profile_network.empty")}</span>
			</div>
		);
	} else {
		body = (
			<>
				{incoming.map((profile) => (
					<LinkedProfileRow
						key={`in-${profile.profileId}`}
						profile={profile}
						subtitle={t("profile_network.wants_to_link")}
						actions={
							<div className="flex shrink-0 items-center gap-2">
								<button
									type="button"
									disabled={pendingId != null}
									onClick={() => run(profile, "remove")}
									aria-label={t("profile_network.decline")}
									className={`${linkPillClass} ink-tint-10 text-[var(--text)]`}
								>
									<X className="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									disabled={pendingId != null}
									onClick={() => run(profile, "accept")}
									className={`${linkPillClass} bg-[var(--accent)] text-[var(--accent-contrast)]`}
								>
									{spinnerOr(profile, <Check className="h-3.5 w-3.5" />)}
									{t("profile_network.accept")}
								</button>
							</div>
						}
					/>
				))}
				{links.map((profile) => (
					<LinkedProfileRow
						key={`link-${profile.profileId}`}
						profile={profile}
						subtitle={profile.since ? t("profile_network.linked_since", { date: new Date(profile.since).toLocaleDateString() }) : undefined}
						actions={
							<button
								type="button"
								disabled={pendingId != null}
								onClick={() => setUnlinkTarget(profile)}
								className={`${linkPillClass} ink-tint-10 text-red-400`}
							>
								{spinnerOr(profile, <Unlink className="h-3.5 w-3.5" />)}
								{t("profile_network.unlink_short")}
							</button>
						}
					/>
				))}
				{outgoing.map((profile) => (
					<LinkedProfileRow
						key={`out-${profile.profileId}`}
						profile={profile}
						subtitle={t("profile_network.request_pending")}
						actions={
							<button
								type="button"
								disabled={pendingId != null}
								onClick={() => run(profile, "remove")}
								className={`${linkPillClass} ink-tint-10 text-[var(--text)]`}
							>
								{spinnerOr(profile, null)}
								{t("profile_network.withdraw")}
							</button>
						}
					/>
				))}
			</>
		);
	}

	return (
		<div ref={sectionRef} className="scroll-mt-4">
			<FieldSection title={t("profile_network.linked_profiles")} action={data ? count : undefined} footer={hint}>
				{body}
			</FieldSection>

			{/* Portaled like the editor's other dialogs: inside the profile dialog it would be clipped. */}
			{createPortal(
				<ConfirmDialog
					isOpen={unlinkTarget != null}
					title={t("profile_network.unlink_confirm_title")}
					message={t("profile_network.unlink_confirm_message", {
						name: unlinkTarget?.displayName?.trim() || t("common.unknown_display_name"),
					})}
					confirmLabel={t("profile_network.unlink")}
					cancelLabel={t("common.cancel")}
					confirmTone="danger"
					isProcessing={pendingId != null}
					onConfirm={() => {
						if (unlinkTarget) run(unlinkTarget, "remove");
					}}
					onCancel={() => setUnlinkTarget(null)}
				/>,
				document.body,
			)}
		</div>
	);
}
