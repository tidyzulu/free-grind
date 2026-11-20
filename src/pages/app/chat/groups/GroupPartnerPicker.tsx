import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileImage } from "../../../../components/ui/profile-image";
import { SheetSearchInput } from "../../../../components/ui/sheet-section";
import { resolveAvatarSrc } from "../../../../services/avatarStore";
import type { ConversationEntry } from "../../../../types/messages";
import { cn } from "../../../../utils/cn";
import { getOtherParticipant, getParticipantAvatarUrl, isGroupConversation } from "../chatUtils";

export type GroupCandidate = { profileId: number; name: string; primaryMediaHash: string | null };

/**
 * Who can be invited: the other side of each 1:1 chat in the inbox (the
 * server only accepts existing chat partners), minus `exclude`.
 */
export function groupCandidatesFrom(
	conversations: ConversationEntry[],
	userId: number | null,
	exclude: ReadonlySet<number>,
	nicknames: Record<string, string> = {},
): GroupCandidate[] {
	const seen = new Set<number>();
	const out: GroupCandidate[] = [];
	for (const c of conversations) {
		if (isGroupConversation(c) || !c.data.preview) continue;
		const other = getOtherParticipant(c, userId);
		if (!other || seen.has(other.profileId) || exclude.has(other.profileId)) continue;
		seen.add(other.profileId);
		out.push({
			profileId: other.profileId,
			name: nicknames[String(other.profileId)] || c.data.name || String(other.profileId),
			primaryMediaHash: other.primaryMediaHash ?? null,
		});
	}
	return out;
}

/** Searchable multi-select of chat partners; fills the rest of an expandable sheet. */
export function GroupPartnerPicker({
	candidates,
	selected,
	onToggle,
	maxSelectable,
}: {
	candidates: GroupCandidate[];
	selected: ReadonlySet<number>;
	onToggle: (profileId: number) => void;
	/** Further picks are disabled once this many are selected. */
	maxSelectable?: number | null;
}) {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates;
	}, [candidates, query]);
	const full = maxSelectable != null && selected.size >= maxSelectable;

	// Floating search over a full-bleed list, like the other picker sheets
	// (the sheet panel has px-4; the list cancels it so rows run edge to edge).
	return (
		<>
			<SheetSearchInput floating value={query} onChange={setQuery} placeholder={t("group_chat.search_partners", { defaultValue: "Search chats" })} />
			<div className="-mx-4 min-h-0 flex-1 overflow-y-auto pb-2" data-lenis-prevent>
				{candidates.length === 0 ? (
					<p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
						{t("group_chat.no_partners", { defaultValue: "Only people you already chat with can be added." })}
					</p>
				) : (
					filtered.map((c) => {
						const isSelected = selected.has(c.profileId);
						const disabled = !isSelected && full;
						return (
							<button
								key={c.profileId}
								type="button"
								onClick={() => onToggle(c.profileId)}
								disabled={disabled}
								aria-pressed={isSelected}
								className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:ink-tint-6 active:ink-tint-10 disabled:opacity-40"
							>
								<div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)] drop-shadow-sm">
									<ProfileImage src={resolveAvatarSrc(c.primaryMediaHash, getParticipantAvatarUrl(c.primaryMediaHash))} alt={c.name} />
								</div>
								<span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">{c.name}</span>
								<span
									className={cn(
										"flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
										isSelected ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)]",
									)}
								>
									{isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
								</span>
							</button>
						);
					})
				)}
			</div>
		</>
	);
}
