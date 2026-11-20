import { linkErrorMessage } from "../profile-network/linkErrorMessage";
import type { ReactNode } from "react";
import { Check, Link2, Loader2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { ProfileImage } from "../../../components/ui/profile-image";
import { type ProfileLinkAction, useProfileLinkAction } from "../../../hooks/queries/useReputationQueries";
import { cn } from "../../../utils/cn";
import { haptic } from "../../../utils/haptics";
import { getThumbImageUrl, validateMediaHash } from "../../../utils/media";
import { ChatCompactCard, ChatCoverCard, MediaBadge, cardButtonClass } from "./ChatCoverCard";

export const PROFILE_LINK_REQUEST_TYPE = "ProfileLinkRequest";
export const PROFILE_LINK_EVENT_TYPE = "ProfileLinkEvent";

type LinkRequestState = "pending" | "accepted" | "declined" | "withdrawn";

/** The request's outcome as the server keeps it in the (dynamic) message body. */
export function linkRequestState(body: unknown): LinkRequestState {
	const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : null;
	return status === "accepted" || status === "declined" || status === "withdrawn" ? status : "pending";
}

function bodyHash(body: unknown, key: "requesterImageHash" | "targetImageHash"): string | null {
	const hash = body && typeof body === "object" ? (body as Record<string, unknown>)[key] : null;
	return typeof hash === "string" && validateMediaHash(hash) ? hash : null;
}

const thumb = (hash: string | null) => (hash && validateMediaHash(hash) ? getThumbImageUrl(hash, "320x320") : null);

/**
 * A "ProfileLinkRequest" message (Free Grind server, flag profile-reputation),
 * as a card like the album / shared-profile cards: both profile photos side
 * by side (compact without any photo). The recipient accepts or declines
 * right here, the sender can withdraw; the outcome comes back live (the
 * message is dynamic).
 */
export function ProfileLinkRequestCard({
	body,
	mine,
	partnerProfileId,
	partnerImageHash,
	ownImageHash,
	tailCorner,
	meta,
}: {
	body: unknown;
	mine: boolean;
	partnerProfileId: string | null;
	/** Current photos, for requests sent before the message carried them. */
	partnerImageHash: string | null;
	ownImageHash: string | null;
	tailCorner: string;
	/** Time / menu, as on the other cards. */
	meta: ReactNode;
}) {
	const { t } = useTranslation();
	const linkAction = useProfileLinkAction();
	const state = linkRequestState(body);
	const busy = linkAction.isPending;

	const run = (action: ProfileLinkAction) => {
		if (!partnerProfileId) return;
		haptic(10);
		linkAction.mutate(
			{ profileId: partnerProfileId, action },
			{
				onSuccess: () => {
					if (action === "accept") toast.success(t("profile_network.linked_toast"));
				},
				onError: (error) => toast.error(linkErrorMessage(error, t)),
			},
		);
	};

	const requesterPhoto = thumb(bodyHash(body, "requesterImageHash") ?? (mine ? ownImageHash : partnerImageHash));
	const targetPhoto = thumb(bodyHash(body, "targetImageHash") ?? (mine ? partnerImageHash : ownImageHash));
	const onCover = requesterPhoto != null || targetPhoto != null;

	const statusText =
		state === "accepted"
			? t("profile_network.chat.status_accepted")
			: state === "declined"
				? t("profile_network.chat.status_declined")
				: state === "withdrawn"
					? t("profile_network.chat.status_withdrawn")
					: mine
						? t("profile_network.chat.status_waiting")
						: null;
	const status = statusText ? (
		<>
			<span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", state === "accepted" ? "bg-green-500" : "bg-current opacity-60")} />
			<span className="truncate">{statusText}</span>
		</>
	) : null;

	const click = (action: ProfileLinkAction) => (event: React.MouseEvent) => {
		event.stopPropagation();
		run(action);
	};
	const actions =
		state !== "pending" || !partnerProfileId
			? undefined
			: mine
				? [
						<button key="withdraw" type="button" disabled={busy} onClick={click("remove")} className={cardButtonClass({ onCover })}>
							{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
							{t("profile_network.withdraw")}
						</button>,
					]
				: [
						<button key="accept" type="button" disabled={busy} onClick={click("accept")} className={cardButtonClass({ primary: true, onCover })}>
							{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
							<span className="truncate">{t("profile_network.accept")}</span>
						</button>,
						<button key="decline" type="button" disabled={busy} onClick={click("remove")} className={cardButtonClass({ onCover })}>
							<X className="h-3.5 w-3.5" />
							<span className="truncate">{t("profile_network.decline")}</span>
						</button>,
					];

	const content = {
		title: t("profile_network.chat.title"),
		text: mine ? t("profile_network.chat.request_mine") : t("profile_network.chat.request_theirs"),
		status,
		actions,
		meta,
		tailCorner,
	};

	if (!onCover) return <ChatCompactCard {...content} icon={<Link2 />} tint="var(--accent)" />;

	const cover = (
		<div className="relative flex h-full w-full">
			{[requesterPhoto, targetPhoto].map((src, i) => (
				<div key={i} className={cn("relative h-full w-1/2 overflow-hidden", i === 0 && "border-e border-black/40")}>
					<ProfileImage src={src} alt="" placeholder="silhouette" className="object-top" />
				</div>
			))}
			{/* Where the two photos meet, in the photo area above the text. */}
			<span className="absolute start-1/2 top-[28%] flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] backdrop-blur-md rtl:translate-x-1/2">
				<Link2 className="h-4 w-4" />
			</span>
		</div>
	);

	return <ChatCoverCard {...content} cover={cover} badge={<MediaBadge icon={<Link2 />} label={t("profile_network.chat.badge")} />} />;
}
