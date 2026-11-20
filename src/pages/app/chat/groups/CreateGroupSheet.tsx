import { UsersThree } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { NATIVE_SHEET_BG } from "../../../../components/ui/action-sheet";
import { BottomSheet, SHEET_FOOTER_CLASS, SheetCloseButton, sheetButtonClass } from "../../../../components/ui/bottom-sheet";
import { SheetSection, SheetTextInput } from "../../../../components/ui/sheet-section";
import { useApiFunctions } from "../../../../hooks/useApiFunctions";
import { upsertGroup } from "../../../../services/groupChatStore";
import type { ChatGroup, ConversationEntry } from "../../../../types/messages";
import { GroupPartnerPicker, groupCandidatesFrom } from "./GroupPartnerPicker";

const NAME_MAX = 64;

/**
 * New group: a name and the chat partners to invite. Invitees join only
 * once they accept; the group starts with just its creator.
 */
export function CreateGroupSheet({
	conversations,
	userId,
	localNicknamesByProfileId,
	isDesktop,
	onClose,
	onCreated,
}: {
	conversations: ConversationEntry[];
	userId: number | null;
	localNicknamesByProfileId?: Record<string, string>;
	isDesktop: boolean;
	onClose: () => void;
	onCreated: (group: ChatGroup) => void;
}) {
	const { t } = useTranslation();
	const api = useApiFunctions();
	const [name, setName] = useState("");
	const [selected, setSelected] = useState<Set<number>>(() => new Set());
	const [isCreating, setIsCreating] = useState(false);
	const closeRef = useRef<(() => void) | null>(null);
	const candidates = useMemo(
		() => groupCandidatesFrom(conversations, userId, new Set(), localNicknamesByProfileId),
		[conversations, userId, localNicknamesByProfileId],
	);
	const trimmed = name.trim();
	const canCreate = trimmed.length > 0 && selected.size > 0 && !isCreating;

	const toggle = (profileId: number) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(profileId)) next.delete(profileId);
			else next.add(profileId);
			return next;
		});

	const create = async () => {
		if (!canCreate) return;
		setIsCreating(true);
		try {
			const group = await api.createGroup(trimmed, [...selected]);
			upsertGroup(group);
			const invited = group.members.filter((m) => m.status === "INVITED").length;
			if (invited < selected.size) {
				toast(t("group_chat.some_not_invited", { defaultValue: "Some people couldn't be invited." }));
			}
			onCreated(group);
			closeRef.current?.();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("group_chat.errors.create_failed", { defaultValue: "Couldn't create the group." }));
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<BottomSheet
			onClose={onClose}
			isDesktop={isDesktop}
			expandable
			isProcessing={isCreating}
			closeRef={closeRef}
			bg={NATIVE_SHEET_BG}
			panelClassName={isDesktop ? "max-h-[82dvh] px-4" : "px-4"}
		>
			<div className="mb-3 flex shrink-0 items-center justify-between gap-3">
				<h3 className="text-sm font-semibold text-[var(--text)]">{t("group_chat.create_title", { defaultValue: "New group" })}</h3>
				<SheetCloseButton disabled={isCreating} />
			</div>
			<SheetSection className="mb-4 shrink-0" title={t("group_chat.name_label", { defaultValue: "Group name" })}>
				<SheetTextInput
					value={name}
					onChange={(v) => setName(v.slice(0, NAME_MAX))}
					maxLength={NAME_MAX}
					placeholder={t("group_chat.name_placeholder", { defaultValue: "e.g. Friday night" })}
					autoFocus={isDesktop}
				/>
				<p className="mt-2 px-1 text-xs text-[var(--text-muted)]">
					{t("group_chat.invite_hint", { defaultValue: "Invited people join once they accept. Only your chat partners can be added." })}
				</p>
			</SheetSection>
			<div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
				<p className="text-xs font-semibold text-[var(--text-muted)]">{t("group_chat.invite_label", { defaultValue: "Invite" })}</p>
				{selected.size > 0 && <span className="text-xs font-semibold tabular-nums text-[var(--text)]">{selected.size}</span>}
			</div>
			<GroupPartnerPicker candidates={candidates} selected={selected} onToggle={toggle} />
			<div className={SHEET_FOOTER_CLASS}>
				<button type="button" onClick={() => void create()} disabled={!canCreate} className={sheetButtonClass()}>
					<UsersThree weight="fill" className="h-4 w-4" />
					<span className="truncate">{t("group_chat.create_action", { defaultValue: "Create group" })}</span>
				</button>
			</div>
		</BottomSheet>
	);
}
