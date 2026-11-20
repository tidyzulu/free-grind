import type { ChatGroup, ConversationEntry } from "../../../../types/messages";
import type { TranslateFn } from "../chatUtils";

/** Who invited us to `group`, if they're still listed. */
export function groupInviter(group: ChatGroup, userId: number | null) {
	const me = group.members.find((m) => m.profileId === userId);
	return group.members.find((m) => m.profileId === me?.invitedBy) ?? null;
}

/**
 * An open group invite as an inbox row: the group's name, "<name> invited
 * you" as preview, the invite's time. Marked `group.invited`, so the list and
 * thread treat it as an invite (no swipe actions, Join / Decline instead of
 * the composer). Never stored: it comes from the group store each render.
 */
export function groupInviteEntry(group: ChatGroup, userId: number | null, t: TranslateFn): ConversationEntry {
	const me = group.members.find((m) => m.profileId === userId);
	const inviter = groupInviter(group, userId);
	const active = group.members.filter((m) => m.status === "ACTIVE" && m.profileId !== userId);
	return {
		data: {
			conversationId: group.conversationId,
			name: group.name,
			participants: active.map((m) => ({ profileId: m.profileId, displayName: m.displayName ?? null, primaryMediaHash: m.primaryMediaHash ?? null })),
			lastActivityTimestamp: me?.invitedAt ?? group.updatedAt ?? null,
			unreadCount: 1,
			preview: {
				conversationId: { value: group.conversationId },
				messageId: `invite:${group.groupId}`,
				senderId: inviter?.profileId,
				type: "GroupInvite",
				text: inviter?.displayName
					? t("group_chat.invited_by", { defaultValue: "{{name}} invited you", name: inviter.displayName })
					: t("group_chat.invited", { defaultValue: "Group invite" }),
			},
			muted: false,
			pinned: false,
			favorite: false,
			group: { groupId: group.groupId, memberCount: active.length, myRole: "MEMBER", invited: true },
		},
	};
}

export const isGroupInviteEntry = (entry: ConversationEntry | null | undefined) => entry?.data.group?.invited === true;
