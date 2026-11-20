import { linkErrorMessage } from "./linkErrorMessage";
import { type ReactNode, useState } from "react";
import { Check, Link2, Unlink, UserCheck, UserX, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import {
	type ProfileLinkAction,
	useProfileLinkAction,
	useProfileLinks,
	useProfileReputation,
	useProfileReputationEnabled,
	useSetPersonallyKnown,
} from "../../../hooks/queries/useReputationQueries";
import { haptic } from "../../../utils/haptics";

const ITEM_CLASS = "flex items-center rounded-sm px-2 py-2 text-start text-sm text-[var(--text)] transition hover-fill disabled:opacity-50";
const ICON_CLASS = "me-2 h-4 w-4 opacity-70";

/**
 * Entries for a profile's actions menu (Free Grind server, flag
 * `profile-reputation`): mark as personally known, and send / withdraw /
 * accept / decline / remove a profile link. `dialog` (the unlink confirm)
 * must be rendered outside the menu, which unmounts on close.
 */
export function useProfileNetworkMenu({
	profileId,
	profileName,
	available,
	closeMenu,
}: {
	profileId: string | null;
	profileName: string;
	/** False for the own profile, a snapshot or a blocked profile. */
	available: boolean;
	closeMenu: () => void;
}): { items: ReactNode; dialog: ReactNode } {
	const { t } = useTranslation();
	const enabled = useProfileReputationEnabled() && available && !!profileId;
	const { data: reputation } = useProfileReputation(profileId, enabled);
	const { data: links } = useProfileLinks(profileId, enabled);
	const setKnown = useSetPersonallyKnown();
	const linkAction = useProfileLinkAction();
	const [confirmUnlink, setConfirmUnlink] = useState(false);

	if (!enabled || !profileId) return { items: null, dialog: null };

	const toggleKnown = (known: boolean) => {
		closeMenu();
		haptic(10);
		setKnown.mutate(
			{ profileId, known },
			{
				onSuccess: () => toast.success(t(known ? "profile_network.marked_known_toast" : "profile_network.unmarked_known_toast", { name: profileName })),
				onError: (error) => toast.error(error instanceof Error ? error.message : t("profile_network.errors.known_failed")),
			},
		);
	};

	const runLinkAction = (action: ProfileLinkAction) => {
		closeMenu();
		haptic(10);
		linkAction.mutate(
			{ profileId, action },
			{
				onSuccess: (status) => {
					if (status === "accepted") toast.success(t("profile_network.linked_toast"));
					else if (action === "request") toast.success(t("profile_network.request_sent_toast"));
					setConfirmUnlink(false);
				},
				onError: (error) => toast.error(linkErrorMessage(error, t)),
			},
		);
	};

	const status = links?.status;
	const busy = linkAction.isPending;
	const item = (key: string, icon: ReactNode, label: string, onClick: () => void, disabled = false) => (
		<button key={key} type="button" disabled={disabled} onClick={onClick} className={ITEM_CLASS}>
			{icon}
			{label}
		</button>
	);

	const items: ReactNode[] = [];
	if (reputation) {
		items.push(
			reputation.knownByMe
				? item("known", <UserX className={ICON_CLASS} />, t("profile_network.unmark_known"), () => toggleKnown(false), setKnown.isPending)
				: item("known", <UserCheck className={ICON_CLASS} />, t("profile_network.mark_known"), () => toggleKnown(true), setKnown.isPending),
		);
	}
	if (status === "none") {
		items.push(item("link", <Link2 className={ICON_CLASS} />, t("profile_network.request_link"), () => runLinkAction("request"), busy));
	} else if (status === "pending_outgoing") {
		items.push(item("link", <X className={ICON_CLASS} />, t("profile_network.withdraw_request"), () => runLinkAction("remove"), busy));
	} else if (status === "pending_incoming") {
		items.push(item("accept", <Check className={ICON_CLASS} />, t("profile_network.accept_request"), () => runLinkAction("accept"), busy));
		items.push(item("decline", <X className={ICON_CLASS} />, t("profile_network.decline_request"), () => runLinkAction("remove"), busy));
	} else if (status === "accepted") {
		items.push(
			item("unlink", <Unlink className={ICON_CLASS} />, t("profile_network.unlink"), () => {
				closeMenu();
				setConfirmUnlink(true);
			}, busy),
		);
	}

	return {
		items: items.length ? <>{items}</> : null,
		dialog: (
			<ConfirmDialog
				isOpen={confirmUnlink}
				title={t("profile_network.unlink_confirm_title")}
				message={t("profile_network.unlink_confirm_message", { name: profileName })}
				confirmLabel={t("profile_network.unlink")}
				cancelLabel={t("common.cancel")}
				confirmTone="danger"
				isProcessing={busy}
				onConfirm={() => runLinkAction("remove")}
				onCancel={() => setConfirmUnlink(false)}
			/>
		),
	};
}
