/**
 * Group chats — an extension of the Free Grind server (flag `group-chats`).
 * Upstream only defines the send target `{ type: "Group", targetId }`; the
 * conversation id "group:<groupId>" and everything else are the server's own.
 * Direct conversation ids stay "<lowerProfileId>:<higherProfileId>".
 */

export const GROUP_CHATS_FLAG = "group-chats";

const GROUP_ID_RE = /^group:(\d{1,19})$/;

export function isGroupConversationId(conversationId: string | null | undefined): boolean {
	return !!conversationId && GROUP_ID_RE.test(conversationId);
}

export function groupIdOfConversation(conversationId: string | null | undefined): number | null {
	const m = conversationId ? GROUP_ID_RE.exec(conversationId) : null;
	return m ? Number(m[1]) : null;
}

export function groupConversationId(groupId: number): string {
	return `group:${groupId}`;
}

/** The two profile ids of a direct conversation id, or null (groups, malformed ids). */
export function directConversationProfiles(conversationId: string | null | undefined): [string, string] | null {
	const m = conversationId ? /^(\d{1,19}):(\d{1,19})$/.exec(conversationId) : null;
	return m ? [m[1]!, m[2]!] : null;
}

export type ChatSendTarget = { type: "Direct" | "Group"; targetId: number };
