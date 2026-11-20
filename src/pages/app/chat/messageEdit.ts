/**
 * messageEdit.ts — editing sent text messages.
 *
 * Upstream has no message editing; the Free Grind server offers it while the
 * `chat-message-edit` flag is on (POST /v4/chat/message/edit, earlier versions
 * stay on the server for moderation). Grindr's server has no such flag, so the
 * action never shows there.
 */

import type { UiMessage } from "../../../types/chat-page";
import { useAssignment } from "../../../services/assignmentsStore";
import { isAssignmentValueOn } from "../../../utils/assignments";
import { isLocalClientMessageId } from "./chatUtils";

export const MESSAGE_EDIT_FLAG = "chat-message-edit";

/**
 * Whether editing is on, and for how long after sending a message stays
 * editable: the server sends its setting as the flag's payload
 * (`maxAgeMinutes`, 0 = no limit). Unknown → no limit here; the server still
 * enforces its own.
 */
export function useMessageEditWindow(): { enabled: boolean; maxAgeMs: number | null } {
	const assignment = useAssignment(MESSAGE_EDIT_FLAG);
	const enabled = assignment ? isAssignmentValueOn(assignment.value) : false;
	const minutes = (assignment?.payload as { maxAgeMinutes?: unknown } | null | undefined)?.maxAgeMinutes;
	const maxAgeMs = typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : null;
	return { enabled, maxAgeMs };
}

/** Still inside the editing window (message timestamps are the server's). */
export function isWithinEditWindow(message: UiMessage, maxAgeMs: number | null, now = Date.now()): boolean {
	return maxAgeMs == null || now - message.timestamp <= maxAgeMs;
}

/** My own, sent, still visible Text message: the only kind the server lets me edit. */
export function isEditableMessage(message: UiMessage, userId: number | string | null | undefined): boolean {
	if (userId == null || Number(message.senderId) !== Number(userId)) return false;
	if (message.type !== "Text" || message.unsent || message.localHistory || message.clientState) return false;
	if (isLocalClientMessageId(message.messageId)) return false;
	const text = (message.body as { text?: unknown } | null | undefined)?.text;
	return typeof text === "string";
}

export function messageText(message: UiMessage): string {
	const text = (message.body as { text?: unknown } | null | undefined)?.text;
	return typeof text === "string" ? text : "";
}
