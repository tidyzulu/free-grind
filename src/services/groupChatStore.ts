/**
 * groupChatStore.ts — group chats (Free Grind server extension, flag
 * `group-chats`): open invites and the latest details of each group, fed by
 * REST loads and the chat.v1.group.* realtime events (ChatRealtimeBridge).
 */

import { useSyncExternalStore } from "react";
import { type ChatGroup, chatGroupSchema } from "../types/messages";
import { appLog } from "../utils/logger";
import { getSetting, setSetting } from "./chatDb";

type State = { invites: ChatGroup[]; groups: ReadonlyMap<number, ChatGroup> };

let state: State = { invites: [], groups: new Map() };
const listeners = new Set<() => void>();

/** A group we're no longer in (left, removed, declined, deleted): drop its conversation. */
export const GROUP_REMOVED_EVENT = "fg:group-removed";
export type GroupRemovedDetail = { groupId: number; conversationId: string; reason: string };

function emit(next: State): void {
	state = next;
	for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getGroupChatState(): State {
	return state;
}

const snapshotKey = (groupId: number) => `group_snapshot:${groupId}`;

/**
 * The last state we saw of a group we were in — shown (read-only) once we've
 * been removed or the group is gone and the server no longer hands it out.
 */
export async function loadGroupSnapshot(groupId: number): Promise<ChatGroup | null> {
	const raw = await getSetting<unknown>(snapshotKey(groupId)).catch(() => null);
	const parsed = chatGroupSchema.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

/** Stores a group as seen by us: active → details, invited → invite list. */
export function upsertGroup(group: ChatGroup): void {
	if (group.myStatus === "ACTIVE") {
		void setSetting(snapshotKey(group.groupId), group).catch((error: unknown) => appLog.warn("[group-chat] saving snapshot failed", error));
	}
	const groups = new Map(state.groups);
	groups.set(group.groupId, group);
	const invites = state.invites.filter((g) => g.groupId !== group.groupId);
	if (group.myStatus === "INVITED") invites.push(group);
	emit({ invites, groups });
}

export function setGroupInvites(invites: ChatGroup[]): void {
	const groups = new Map(state.groups);
	for (const g of invites) groups.set(g.groupId, g);
	emit({ invites, groups });
}

export function forgetGroup(groupId: number): void {
	const groups = new Map(state.groups);
	groups.delete(groupId);
	emit({ invites: state.invites.filter((g) => g.groupId !== groupId), groups });
}

export function clearGroupChatState(): void {
	emit({ invites: [], groups: new Map() });
}

/**
 * chat.v1.group.invite / .updated / .removed. Returns the removal (if any) so
 * the bridge can drop the local conversation before ChatPage hears about it.
 */
export function applyGroupRealtimeEvent(type: string, payload: unknown): GroupRemovedDetail | null {
	const record = (payload ?? {}) as Record<string, unknown>;
	if (type === "chat.v1.group.invite" || type === "chat.v1.group.updated") {
		const parsed = chatGroupSchema.safeParse(record.group);
		if (parsed.success) upsertGroup(parsed.data);
		else appLog.warn(`[group-chat] unparsable ${type}`, parsed.error);
		return null;
	}
	if (type === "chat.v1.group.removed") {
		const groupId = Number(record.groupId);
		const conversationId = typeof record.conversationId === "string" ? record.conversationId : `group:${groupId}`;
		if (!Number.isFinite(groupId)) return null;
		forgetGroup(groupId);
		return { groupId, conversationId, reason: typeof record.reason === "string" ? record.reason : "removed" };
	}
	return null;
}

export function useGroupInvites(): ChatGroup[] {
	return useSyncExternalStore(subscribe, () => state.invites);
}

export function useChatGroup(groupId: number | null): ChatGroup | null {
	return useSyncExternalStore(subscribe, () => (groupId == null ? null : (state.groups.get(groupId) ?? null)));
}
