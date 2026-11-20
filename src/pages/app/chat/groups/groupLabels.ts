import type { Message } from "../../../../types/messages";
import type { TranslateFn } from "../chatUtils";

/** Text of a GroupEvent line: "Alex created the group", "Sam joined", … */
export function getGroupEventLabel(message: Pick<Message, "body" | "senderId">, t: TranslateFn, nameOf: (id: number | null | undefined) => string): string {
	const body = (message.body ?? {}) as { event?: string; actorId?: number; profileIds?: number[]; name?: string; role?: string };
	const actor = nameOf(body.actorId ?? message.senderId);
	const targets = (body.profileIds ?? []).map((id) => nameOf(id)).join(", ");
	switch (body.event) {
		case "created":
			return t("group_chat.event.created", { defaultValue: "{{actor}} created the group \"{{name}}\"", actor, name: body.name ?? "" });
		case "invited":
			return t("group_chat.event.invited", { defaultValue: "{{actor}} invited {{targets}}", actor, targets });
		case "joined":
			return t("group_chat.event.joined", { defaultValue: "{{actor}} joined", actor });
		case "left":
			return t("group_chat.event.left", { defaultValue: "{{actor}} left", actor });
		case "removed":
			return t("group_chat.event.removed", { defaultValue: "{{actor}} removed {{targets}}", actor, targets });
		case "renamed":
			return t("group_chat.event.renamed", { defaultValue: "{{actor}} renamed the group to \"{{name}}\"", actor, name: body.name ?? "" });
		case "role":
			return body.role === "OWNER"
				? t("group_chat.event.owner", { defaultValue: "{{targets}} is now the owner", targets })
				: body.role === "ADMIN"
					? t("group_chat.event.admin", { defaultValue: "{{targets}} is now an admin", targets })
					: t("group_chat.event.member", { defaultValue: "{{targets}} is no longer an admin", targets });
		default:
			return t("group_chat.preview.event", { defaultValue: "Group updated" });
	}
}
