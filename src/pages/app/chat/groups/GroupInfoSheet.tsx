import { Crown, LogOut, Pencil, Shield, ShieldOff, UserMinus, UserPlus, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { NATIVE_SHEET_BG, type SheetAction, SheetActionList, afterSheetClose } from "../../../../components/ui/action-sheet";
import { SHEET_GROUP_CLASS, SheetSection } from "../../../../components/ui/sheet-section";
import { BottomSheet, SHEET_FOOTER_CLASS, SHEET_ICON_BUTTON_CLASS, SheetCloseButton, sheetButtonClass } from "../../../../components/ui/bottom-sheet";
import { UserPlusFilled } from "../../../../components/icons/FilledIcons";
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog";
import { ProfileImage } from "../../../../components/ui/profile-image";
import { PromptDialog } from "../../../../components/ui/prompt-dialog";
import { useApiFunctions } from "../../../../hooks/useApiFunctions";
import { resolveAvatarSrc } from "../../../../services/avatarStore";
import { loadGroupSnapshot, upsertGroup, useChatGroup } from "../../../../services/groupChatStore";
import { ApiFunctionError } from "../../../../services/apiHelpers";
import type { ChatGroup, ChatGroupMember, ChatGroupRole, ConversationEntry } from "../../../../types/messages";
import { getParticipantAvatarUrl } from "../chatUtils";
import { GroupPartnerPicker, groupCandidatesFrom } from "./GroupPartnerPicker";

const ROLE_ORDER: Record<ChatGroupRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

/** Without a saved snapshot: what the inbox entry knew (name, other members). */
function groupFromEntry(groupId: number, entry: ConversationEntry | null | undefined): ChatGroup | null {
	if (!entry) return null;
	return {
		groupId,
		conversationId: entry.data.conversationId,
		name: entry.data.name ?? "",
		myRole: null,
		myStatus: null,
		maxMembers: null,
		members: entry.data.participants.map((p) => ({
			profileId: p.profileId,
			role: "MEMBER" as const,
			status: "ACTIVE" as const,
			invitedBy: null,
			displayName: p.displayName ?? null,
			primaryMediaHash: p.primaryMediaHash ?? null,
			blocked: false,
		})),
	};
}

/**
 * Group details: members with roles and pending invites, rename, invite
 * more chat partners, manage roles, remove members, leave. What's offered
 * follows the server's rules (owner/admins manage, the owner sets roles).
 * Once we're out of the group (`readOnly`, or the server refuses it) it shows
 * the last saved snapshot read-only.
 */
export function GroupInfoSheet({
	groupId,
	userId,
	conversations,
	localNicknamesByProfileId,
	isDesktop,
	onClose,
	onLeft,
	onOpenProfile,
	readOnly = false,
	entry,
}: {
	groupId: number;
	/** We're no longer in the group (archived chat): snapshot only, no actions. */
	readOnly?: boolean;
	/** The group's inbox entry, the fallback when there's no snapshot. */
	entry?: ConversationEntry | null;
	userId: number | null;
	conversations: ConversationEntry[];
	localNicknamesByProfileId?: Record<string, string>;
	isDesktop: boolean;
	onClose: () => void;
	onLeft: (groupId: number) => void;
	onOpenProfile: (profileId: number) => void;
}) {
	const { t } = useTranslation();
	const api = useApiFunctions();
	const liveGroup = useChatGroup(groupId);
	const [unavailable, setUnavailable] = useState(readOnly);
	const [snapshot, setSnapshot] = useState<ChatGroup | null>(null);
	const group = unavailable ? (snapshot ?? groupFromEntry(groupId, entry)) : liveGroup;
	const [mode, setMode] = useState<"info" | "invite">("info");
	const [selected, setSelected] = useState<Set<number>>(() => new Set());
	const [memberActions, setMemberActions] = useState<ChatGroupMember | null>(null);
	const [isRenameOpen, setIsRenameOpen] = useState(false);
	const [isLeaveOpen, setIsLeaveOpen] = useState(false);
	const [isBusy, setIsBusy] = useState(false);
	const closeRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		let cancelled = false;
		const showSnapshot = () => {
			setUnavailable(true);
			void loadGroupSnapshot(groupId).then((saved) => {
				if (!cancelled) setSnapshot(saved);
			});
		};
		if (readOnly) {
			showSnapshot();
			return () => {
				cancelled = true;
			};
		}
		api
			.getGroup(groupId)
			.then((g) => {
				if (!cancelled) upsertGroup(g);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				// Not (or no longer) a member, or the group is gone: the saved snapshot instead.
				if (error instanceof ApiFunctionError && (error.status === 403 || error.status === 404)) showSnapshot();
				else toast.error(error instanceof Error ? error.message : t("group_chat.errors.load_failed", { defaultValue: "Couldn't load the group." }));
			});
		return () => {
			cancelled = true;
		};
	}, [api, groupId, readOnly, t]);

	const myRole = unavailable ? null : (group?.myRole ?? "MEMBER");
	const canManage = myRole === "OWNER" || myRole === "ADMIN";
	const members = useMemo(
		() =>
			[...(group?.members ?? [])]
				// Out of the group: we're no longer one of its members.
				.filter((m) => !(unavailable && m.profileId === userId))
				.sort(
				(a, b) => (a.status === b.status ? 0 : a.status === "ACTIVE" ? -1 : 1) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
			),
		[group, unavailable, userId],
	);
	const activeCount = members.filter((m) => m.status === "ACTIVE").length;
	const candidates = useMemo(
		() => groupCandidatesFrom(conversations, userId, new Set(members.map((m) => m.profileId)), localNicknamesByProfileId),
		[conversations, userId, members, localNicknamesByProfileId],
	);
	const freeSlots = group?.maxMembers != null ? Math.max(0, group.maxMembers - members.length) : null;

	const run = async (action: () => Promise<ChatGroup | void>, errorKey = "group_chat.errors.update_failed") => {
		setIsBusy(true);
		try {
			const result = await action();
			if (result) upsertGroup(result);
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t(errorKey, { defaultValue: "Couldn't update the group." }));
			return false;
		} finally {
			setIsBusy(false);
		}
	};

	const memberName = (m: ChatGroupMember) =>
		m.profileId === userId
			? t("group_chat.you", { defaultValue: "You" })
			: localNicknamesByProfileId?.[String(m.profileId)] || m.displayName || t("common.unknown_display_name");

	const actionsFor = (m: ChatGroupMember): SheetAction[] => {
		const out: SheetAction[] = [];
		if (!m.blocked) {
			out.push({ key: "profile", icon: UserRound, label: t("chat.view_profile"), onSelect: () => afterSheetClose(() => onOpenProfile(m.profileId)) });
		}
		if (m.status === "ACTIVE" && myRole === "OWNER") {
			if (m.role === "MEMBER") {
				out.push({ key: "admin", icon: Shield, label: t("group_chat.make_admin", { defaultValue: "Make admin" }), onSelect: () => void run(() => api.setGroupMemberRole(groupId, m.profileId, "ADMIN")) });
			} else if (m.role === "ADMIN") {
				out.push({ key: "member", icon: ShieldOff, label: t("group_chat.remove_admin", { defaultValue: "Remove admin" }), onSelect: () => void run(() => api.setGroupMemberRole(groupId, m.profileId, "MEMBER")) });
			}
			out.push({
				key: "owner",
				icon: Crown,
				label: t("group_chat.make_owner", { defaultValue: "Make owner" }),
				description: t("group_chat.make_owner_hint", { defaultValue: "You become an admin." }),
				onSelect: () => void run(() => api.setGroupMemberRole(groupId, m.profileId, "OWNER")),
			});
		}
		const canRemove = myRole === "OWNER" || (myRole === "ADMIN" && m.role === "MEMBER") || (m.status === "INVITED" && m.invitedBy === userId);
		if (canRemove) {
			out.push({
				key: "remove",
				icon: UserMinus,
				tone: "danger",
				label: m.status === "INVITED" ? t("group_chat.revoke_invite", { defaultValue: "Withdraw invite" }) : t("group_chat.remove_member", { defaultValue: "Remove from group" }),
				onSelect: () =>
					void run(async () => {
						await api.removeGroupMember(groupId, m.profileId);
						return api.getGroup(groupId);
					}),
			});
		}
		return out;
	};

	const invite = async () => {
		if (!selected.size) return;
		const ok = await run(() => api.inviteGroupMembers(groupId, [...selected]), "group_chat.errors.invite_failed");
		if (ok) {
			setSelected(new Set());
			setMode("info");
		}
	};

	const leave = async () => {
		const ok = await run(() => api.leaveGroup(groupId), "group_chat.errors.leave_failed");
		setIsLeaveOpen(false);
		if (ok) {
			closeRef.current?.();
			onLeft(groupId);
		}
	};

	// You first, then owner, admins, members (members is sorted by role already).
	const activeMembers = [
		...members.filter((m) => m.status === "ACTIVE" && m.profileId === userId),
		...members.filter((m) => m.status === "ACTIVE" && m.profileId !== userId),
	];
	const invitedMembers = members.filter((m) => m.status === "INVITED");

	const renderMember = (m: ChatGroupMember) => {
		const role = m.status === "ACTIVE" ? roleLabel(m) : null;
		// Nothing to offer (yourself, or e.g. a blocked invitee for a plain member): not tappable.
		const inert = m.profileId === userId || actionsFor(m).length === 0;
		return (
			<button
				key={m.profileId}
				type="button"
				onClick={() => !inert && setMemberActions(m)}
				disabled={inert}
				className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover-fill disabled:cursor-default"
			>
				<div className={`h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)] ${m.status === "INVITED" ? "opacity-60" : ""}`}>
					<ProfileImage src={resolveAvatarSrc(m.primaryMediaHash, getParticipantAvatarUrl(m.primaryMediaHash))} alt={memberName(m)} />
				</div>
				<span className="grid min-w-0 flex-1">
					<span className="truncate text-sm font-medium text-[var(--text)]">{memberName(m)}</span>
					{role && <span className="truncate text-xs text-[var(--text-muted)]">{role}</span>}
				</span>
			</button>
		);
	};

	const roleLabel = (m: ChatGroupMember) => {
		if (m.status === "INVITED") return t("group_chat.role_invited", { defaultValue: "Invited" });
		if (m.role === "OWNER") return t("group_chat.role_owner", { defaultValue: "Owner" });
		if (m.role === "ADMIN") return t("group_chat.role_admin", { defaultValue: "Admin" });
		return null;
	};

	return (
		<>
			<BottomSheet
				onClose={onClose}
				isDesktop={isDesktop}
				expandable
				isProcessing={isBusy}
				closeRef={closeRef}
				bg={NATIVE_SHEET_BG}
				panelClassName={isDesktop ? "max-h-[82dvh] px-4" : "px-4"}
			>
				<div className="mb-3 flex shrink-0 items-center justify-between gap-3">
					<h3 className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{group?.name ?? "…"}</h3>
					<div className="flex shrink-0 items-center gap-2">
						{canManage && mode === "info" && (
							<button
								type="button"
								onClick={() => setIsRenameOpen(true)}
								aria-label={t("group_chat.rename", { defaultValue: "Rename group" })}
								title={t("group_chat.rename", { defaultValue: "Rename group" })}
								className={SHEET_ICON_BUTTON_CLASS}
							>
								<Pencil className="h-4 w-4" strokeWidth={2.5} />
							</button>
						)}
						<SheetCloseButton />
					</div>
				</div>

				{mode === "invite" ? (
					<>
						<div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
							<p className="text-xs font-semibold text-[var(--text-muted)]">{t("group_chat.invite_label", { defaultValue: "Invite" })}</p>
							{selected.size > 0 && <span className="text-xs font-semibold tabular-nums text-[var(--text)]">{selected.size}</span>}
						</div>
						<GroupPartnerPicker
							candidates={candidates}
							selected={selected}
							maxSelectable={freeSlots}
							onToggle={(id) =>
								setSelected((prev) => {
									const next = new Set(prev);
									if (next.has(id)) next.delete(id);
									else next.add(id);
									return next;
								})
							}
						/>
						<div className={SHEET_FOOTER_CLASS}>
							<button type="button" onClick={() => setMode("info")} className={sheetButtonClass("secondary")}>
								{t("chat.actions.cancel")}
							</button>
							<button type="button" onClick={() => void invite()} disabled={!selected.size || isBusy} className={sheetButtonClass()}>
								<UserPlus className="h-4 w-4" />
								<span className="truncate">{t("group_chat.send_invites", { defaultValue: "Invite" })}</span>
							</button>
						</div>
					</>
				) : (
					<>
						<div className="-mx-4 min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-2" data-lenis-prevent>
							<SheetSection
								title={t("group_chat.members", { defaultValue: "Members" })}
								value={!unavailable && group?.maxMembers != null ? `${members.length}/${group.maxMembers}` : String(activeMembers.length)}
							>
								<div className={SHEET_GROUP_CLASS}>
									{canManage && (
										<button
											type="button"
											onClick={() => setMode("invite")}
											disabled={freeSlots === 0}
											className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm font-semibold text-[var(--accent-readable)] transition hover-fill disabled:opacity-40"
										>
											<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--card-bg)_80%,var(--accent))]">
												<UserPlusFilled className="h-5 w-5" />
											</span>
											{t("group_chat.add_members", { defaultValue: "Add members" })}
										</button>
									)}
									{activeMembers.map(renderMember)}
								</div>
							</SheetSection>
							{invitedMembers.length > 0 && (
								<SheetSection title={t("group_chat.invited_section", { defaultValue: "Invited" })} value={String(invitedMembers.length)}>
									<div className={SHEET_GROUP_CLASS}>{invitedMembers.map(renderMember)}</div>
								</SheetSection>
							)}
						</div>
						{unavailable ? (
							<p className="shrink-0 px-1 pt-2 text-center text-xs text-[var(--text-muted)]">
								{t("group_chat.no_longer_member", { defaultValue: "You're no longer in this group. This is how it looked last." })}
							</p>
						) : (
							<div className={SHEET_FOOTER_CLASS}>
								<button type="button" onClick={() => setIsLeaveOpen(true)} disabled={isBusy} className={sheetButtonClass("destructive")}>
									<LogOut className="h-4 w-4" />
									<span className="truncate">{t("group_chat.leave", { defaultValue: "Leave group" })}</span>
								</button>
							</div>
						)}
					</>
				)}
			</BottomSheet>

			{memberActions && actionsFor(memberActions).length > 0 && (
				<SheetActionList title={memberName(memberActions)} actions={actionsFor(memberActions)} onClose={() => setMemberActions(null)} isDesktop={isDesktop} />
			)}

			<PromptDialog
				isOpen={isRenameOpen}
				title={t("group_chat.rename", { defaultValue: "Rename group" })}
				message={t("group_chat.rename_message", { defaultValue: "Everyone in the group sees the new name." })}
				defaultValue={group?.name ?? ""}
				confirmLabel={t("group_chat.save", { defaultValue: "Save" })}
				cancelLabel={t("chat.actions.cancel")}
				isProcessing={isBusy}
				onCancel={() => setIsRenameOpen(false)}
				onConfirm={async (value) => {
					const name = value.trim().slice(0, 64);
					if (!name) return;
					const ok = await run(() => api.renameGroup(groupId, name));
					if (ok) setIsRenameOpen(false);
				}}
			/>

			<ConfirmDialog
				isOpen={isLeaveOpen}
				title={t("group_chat.leave", { defaultValue: "Leave group" })}
				message={
					activeCount <= 1
						? t("group_chat.leave_last_confirm", { defaultValue: "You're the last member, so the group closes. Your copy of the chat stays as an archive until you delete it." })
						: t("group_chat.leave_confirm", { defaultValue: "You'll no longer get messages from this group. The chat stays as an archive until you delete it." })
				}
				confirmLabel={t("group_chat.leave", { defaultValue: "Leave group" })}
				cancelLabel={t("chat.actions.cancel")}
				confirmTone="danger"
				isProcessing={isBusy}
				onConfirm={leave}
				onCancel={() => setIsLeaveOpen(false)}
			/>
		</>
	);
}
