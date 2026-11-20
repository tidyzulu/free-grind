import { z } from "zod";
import type { RestFetcher } from "../../types/chat-service";
import { type ChatGroup, type ChatGroupRole, chatGroupSchema } from "../../types/messages";
import { assertSuccess, parseJsonSafe } from "../apiHelpers";

/**
 * Group chats — Free Grind server extension (flag `group-chats`). Messages go
 * through the normal chat endpoints with conversation id "group:<id>" and the
 * send target `{ type: "Group", targetId: <id> }`; these are the management calls.
 */

const groupResponseSchema = z.object({ group: chatGroupSchema });
const invitesResponseSchema = z.object({ invites: z.array(chatGroupSchema).default([]) });

export function createGroupMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	const groupCall = async (path: string, init: { method: string; body?: unknown }, errorKey: string): Promise<ChatGroup> => {
		const response = await fetchRest(path, init);
		await assertSuccess(response, t(errorKey));
		return groupResponseSchema.parse(await parseJsonSafe(response)).group;
	};
	const plainCall = async (path: string, init: { method: string; body?: unknown }, errorKey: string): Promise<void> => {
		const response = await fetchRest(path, init);
		await assertSuccess(response, t(errorKey));
	};

	return {
		createGroup(name: string, profileIds: number[]): Promise<ChatGroup> {
			return groupCall("/v1/groups", { method: "POST", body: { name, profileIds } }, "group_chat.errors.create_failed");
		},

		getGroup(groupId: number): Promise<ChatGroup> {
			return groupCall(`/v1/groups/${groupId}`, { method: "GET" }, "group_chat.errors.load_failed");
		},

		async listGroupInvites(): Promise<ChatGroup[]> {
			const response = await fetchRest("/v1/groups/invites", { method: "GET" });
			await assertSuccess(response, t("group_chat.errors.load_failed"));
			return invitesResponseSchema.parse(await parseJsonSafe(response)).invites;
		},

		renameGroup(groupId: number, name: string): Promise<ChatGroup> {
			return groupCall(`/v1/groups/${groupId}`, { method: "PUT", body: { name } }, "group_chat.errors.update_failed");
		},

		inviteGroupMembers(groupId: number, profileIds: number[]): Promise<ChatGroup> {
			return groupCall(`/v1/groups/${groupId}/members`, { method: "POST", body: { profileIds } }, "group_chat.errors.invite_failed");
		},

		removeGroupMember(groupId: number, profileId: number): Promise<void> {
			return plainCall(`/v1/groups/${groupId}/members/${profileId}`, { method: "DELETE" }, "group_chat.errors.update_failed");
		},

		setGroupMemberRole(groupId: number, profileId: number, role: ChatGroupRole): Promise<ChatGroup> {
			return groupCall(`/v1/groups/${groupId}/members/${profileId}/role`, { method: "PUT", body: { role } }, "group_chat.errors.update_failed");
		},

		leaveGroup(groupId: number): Promise<void> {
			return plainCall(`/v1/groups/${groupId}/leave`, { method: "POST" }, "group_chat.errors.leave_failed");
		},

		acceptGroupInvite(groupId: number): Promise<ChatGroup> {
			return groupCall(`/v1/groups/${groupId}/invite/accept`, { method: "POST" }, "group_chat.errors.accept_failed");
		},

		declineGroupInvite(groupId: number): Promise<void> {
			return plainCall(`/v1/groups/${groupId}/invite/decline`, { method: "POST" }, "group_chat.errors.update_failed");
		},

		shareAlbumToGroup(groupId: number, albumId: number, expirationType: string | number): Promise<void> {
			return plainCall(`/v1/groups/${groupId}/albums/${albumId}/share`, { method: "POST", body: { expirationType } }, "chat.errors.album_share_failed");
		},
	};
}
