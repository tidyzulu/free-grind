import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiFunctions } from "../../../../hooks/useApiFunctions";
import { ApiFunctionError } from "../../../../services/apiHelpers";
import { getProfileSnapshot } from "../../../../services/chatDb";
import { loadGroupSnapshot, upsertGroup, useChatGroup } from "../../../../services/groupChatStore";
import type { ChatGroup, ConversationEntry, Message } from "../../../../types/messages";
import { groupIdOfConversation } from "../../../../utils/groupChat";
import { appLog } from "../../../../utils/logger";

type Person = { name: string | null; avatarHash: string | null };

/** Profiles looked up for group names this session (null: nothing to find). */
const profileCache = new Map<number, Person | null>();
const pending = new Set<number>();

async function lookUpProfile(profileId: number, fetchProfile: (id: string) => Promise<{ displayName?: string | null; profileImageMediaHash?: string | null }>): Promise<Person | null> {
	const stored = await getProfileSnapshot(String(profileId)).catch(() => null);
	if (stored) {
		try {
			const data = JSON.parse(stored.data) as { displayName?: string | null; profileImageMediaHash?: string | null };
			if (data.displayName?.trim()) return { name: data.displayName.trim(), avatarHash: data.profileImageMediaHash ?? null };
		} catch {
			// fall through to the live profile
		}
	}
	try {
		const profile = await fetchProfile(String(profileId));
		return profile.displayName?.trim() ? { name: profile.displayName.trim(), avatarHash: profile.profileImageMediaHash ?? null } : null;
	} catch {
		return null;
	}
}

/** Everyone a group thread mentions: senders and the people in membership lines. */
function mentionedIds(messages: readonly Message[]): number[] {
	const ids = new Set<number>();
	for (const m of messages) {
		if (m.senderId) ids.add(Number(m.senderId));
		if (m.type === "GroupEvent") {
			const body = (m.body ?? {}) as { actorId?: number; profileIds?: number[] };
			if (body.actorId) ids.add(Number(body.actorId));
			for (const id of body.profileIds ?? []) ids.add(Number(id));
		}
	}
	return [...ids];
}

/**
 * Names (and photos) for a group thread. In order: local nickname, the group's
 * member list (live, or the saved snapshot once we're out of it), the inbox
 * entry, then the profile itself (local snapshot or one fetch per person and
 * session) for anyone no longer in the group. Null conversation: not a group.
 */
export function useGroupMemberNames(
	conversation: ConversationEntry | null,
	messages: readonly Message[],
	userId: number | null,
	nicknames: Record<string, string> = {},
) {
	const { t } = useTranslation();
	const api = useApiFunctions();
	const groupId = groupIdOfConversation(conversation?.data.conversationId);
	const liveGroup = useChatGroup(groupId);
	const [snapshot, setSnapshot] = useState<ChatGroup | null>(null);
	const [lookups, setLookups] = useState(0);

	// The member list: fetched once per opened group; out of the group → snapshot.
	useEffect(() => {
		if (groupId == null) return;
		let cancelled = false;
		api
			.getGroup(groupId)
			.then((group) => {
				if (!cancelled) upsertGroup(group);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				if (error instanceof ApiFunctionError && (error.status === 403 || error.status === 404)) {
					void loadGroupSnapshot(groupId).then((saved) => {
						if (!cancelled) setSnapshot(saved);
					});
				} else {
					appLog.warn("[group-chat] loading members for names failed", error);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [api, groupId]);

	const group = liveGroup ?? snapshot;
	const known = useMemo(() => {
		const map = new Map<number, Person>();
		for (const p of conversation?.data.participants ?? []) {
			map.set(p.profileId, { name: p.displayName?.trim() || null, avatarHash: p.primaryMediaHash ?? null });
		}
		for (const m of group?.members ?? []) {
			const prev = map.get(m.profileId);
			map.set(m.profileId, { name: m.displayName?.trim() || prev?.name || null, avatarHash: m.primaryMediaHash ?? prev?.avatarHash ?? null });
		}
		return map;
	}, [conversation, group]);

	// Anyone still without a name: look their profile up (once per session).
	const missingKey = useMemo(() => {
		if (groupId == null) return "";
		return mentionedIds(messages)
			.filter((id) => id !== userId && !known.get(id)?.name && !nicknames[String(id)] && !profileCache.has(id) && !pending.has(id))
			.slice(0, 30)
			.join(",");
	}, [groupId, messages, userId, known, nicknames]);

	useEffect(() => {
		if (!missingKey) return;
		const ids = missingKey.split(",").map(Number);
		for (const id of ids) pending.add(id);
		let cancelled = false;
		void Promise.all(
			ids.map(async (id) => {
				profileCache.set(id, await lookUpProfile(id, (pid) => api.getProfileDetail(pid)));
				pending.delete(id);
			}),
		).then(() => {
			if (!cancelled) setLookups((n) => n + 1);
		});
		return () => {
			cancelled = true;
		};
	}, [api, missingKey]);

	return useMemo(() => {
		void lookups;
		const person = (id: number): Person | null => {
			const fromGroup = known.get(id);
			if (fromGroup?.name) return fromGroup;
			return profileCache.get(id) ?? fromGroup ?? null;
		};
		const activeIds = new Set((group?.members ?? []).filter((m) => m.status === "ACTIVE" && !m.blocked).map((m) => m.profileId));
		for (const p of conversation?.data.participants ?? []) activeIds.add(p.profileId);
		return {
			nameOf: (profileId: number | null | undefined): string => {
				if (profileId == null) return t("common.unknown_display_name");
				if (userId != null && profileId === userId) return t("group_chat.you", { defaultValue: "You" });
				return nicknames[String(profileId)] || person(profileId)?.name || t("group_chat.former_member", { defaultValue: "Someone" });
			},
			avatarOf: (profileId: number): string | null => person(profileId)?.avatarHash ?? null,
			/** Still in the group (and not blocked): their name can open the profile. */
			// Out of the group (only the snapshot is left): no profile links.
			isActiveMember: (profileId: number): boolean => (liveGroup || !snapshot ? activeIds.has(profileId) : false),
		};
	}, [known, group, conversation, nicknames, userId, t, lookups, liveGroup, snapshot]);
}
