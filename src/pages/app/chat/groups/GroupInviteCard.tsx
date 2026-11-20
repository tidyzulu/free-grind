import { useTranslation } from "react-i18next";
import { ProfileImage } from "../../../../components/ui/profile-image";
import { resolveAvatarSrc } from "../../../../services/avatarStore";
import type { ChatGroup } from "../../../../types/messages";
import { getParticipantAvatarUrl } from "../chatUtils";
import { GroupAvatar } from "./GroupAvatar";
import { groupInviter } from "./groupInvite";

/** The thread of an open group invite: who invited us and who's in it (Join / Decline sit in the composer's place). */
export function GroupInviteCard({ group, userId }: { group: ChatGroup; userId: number | null }) {
	const { t } = useTranslation();
	const inviter = groupInviter(group, userId);
	const active = group.members.filter((m) => m.status === "ACTIVE" && m.profileId !== userId);
	const shown = active.slice(0, 6);
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
			<div className="h-20 w-20 overflow-hidden rounded-full">
				<GroupAvatar alt={group.name} />
			</div>
			<div className="grid gap-1">
				<p className="text-lg font-semibold text-[var(--text)]">{group.name}</p>
				<p className="text-sm text-[var(--text-muted)]">
					{inviter?.displayName
						? t("group_chat.invited_by", { defaultValue: "{{name}} invited you", name: inviter.displayName })
						: t("group_chat.invited", { defaultValue: "Group invite" })}
				</p>
			</div>
			{shown.length > 0 && (
				<div className="flex flex-col items-center gap-2">
					<div className="flex -space-x-2 rtl:space-x-reverse">
						{shown.map((m) => (
							<div key={m.profileId} className="h-9 w-9 overflow-hidden rounded-full bg-[var(--surface-2)] ring-2 ring-[var(--bg)]">
								<ProfileImage src={resolveAvatarSrc(m.primaryMediaHash, getParticipantAvatarUrl(m.primaryMediaHash))} alt={m.displayName ?? ""} />
							</div>
						))}
					</div>
					<p className="max-w-xs text-xs text-[var(--text-muted)]">
						{t("group_chat.member_count", { defaultValue: "{{count}} members", count: active.length })}
						{active.some((m) => m.displayName) && ` · ${active.map((m) => m.displayName).filter(Boolean).slice(0, 4).join(", ")}${active.length > 4 ? ", …" : ""}`}
					</p>
				</div>
			)}
			<p className="max-w-xs text-xs text-[var(--text-muted)]">
				{t("group_chat.invite_thread_hint", { defaultValue: "Join to see new messages and write in the group. Earlier messages stay hidden." })}
			</p>
		</div>
	);
}
