import type { Message } from "../types/messages";

/**
 * chat.v1.message_sent also fires when an existing message is unsent or
 * reacted to, re-delivering the original message. Without a local lookup,
 * the payload itself still tells us when it's an update: it's unsent, or it
 * carries our own reaction (we just reacted to their message).
 */
export function looksLikeMessageUpdate(m: Message, userId: string | number | null | undefined): boolean {
	// Edited (Free Grind server): the same message again with new text.
	if (m.unsent || m.editedAt != null) return true;
	if (userId == null) return false;
	return m.reactions.some((r) => Number(r.profileId) === Number(userId));
}
