import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProfileImage } from "../../../components/ui/profile-image";
import type { LinkedProfile } from "../../../services/api/reputationMethods";
import { getThumbImageUrl, validateMediaHash } from "../../../utils/media";

/** One linked profile (or link request) in a native list card: avatar, name, optional actions. */
export function LinkedProfileRow({
	profile,
	subtitle,
	onOpen,
	actions,
}: {
	profile: LinkedProfile;
	subtitle?: string;
	/** Opens the profile; without it the row is not tappable (e.g. in the editor, where leaving would drop the draft). */
	onOpen?: (profileId: string) => void;
	/** Shown instead of the chevron, e.g. accept / decline. */
	actions?: ReactNode;
}) {
	const { t } = useTranslation();
	const name = profile.displayName?.trim() || t("common.unknown_display_name");
	const avatarUrl = profile.primaryMediaHash && validateMediaHash(profile.primaryMediaHash) ? getThumbImageUrl(profile.primaryMediaHash, "75x75") : null;
	const content = (
		<>
			<span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--surface-3)]">
				<ProfileImage className="bg-slate-500/15 text-slate-400" src={avatarUrl} alt={t("profile_details.photo_alt", { name })} />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[15px] text-[var(--text)]">{name}</span>
				{subtitle && <span className="block truncate text-xs text-[var(--text-muted)]">{subtitle}</span>}
			</span>
			{!actions && onOpen && <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] rtl:rotate-180" />}
		</>
	);
	return (
		<div className="flex min-h-14 items-center gap-3 px-4 py-2">
			{onOpen ? (
				<button type="button" onClick={() => onOpen(profile.profileId)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
					{content}
				</button>
			) : (
				<div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
			)}
			{actions}
		</div>
	);
}

export const linkPillClass =
	"inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-[transform,background-color,color] duration-150 active:scale-[0.96] disabled:opacity-50";
