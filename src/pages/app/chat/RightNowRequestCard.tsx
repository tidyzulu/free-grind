import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { RightNowIcon } from "../../../components/icons/RightNowIcon";
import { PRIVACY_BLUR_CLASS, PRIVACY_HOVER_REVEAL_CLASS, useMediaBlur } from "../../../hooks/useProfilePhotoPrivacy";
import { useMySettings } from "../../../hooks/queries/useProfileQueries";
import { getThumbImageUrl, validateMediaHash } from "../../../utils/media";
import { cn } from "../../../utils/cn";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { RightNowPostGoneError } from "../../../services/apiFunctions";
import { haptic } from "../../../utils/haptics";
import { ChatCompactCard, ChatCoverCard, MediaBadge, cardButtonClass } from "./ChatCoverCard";

type RightNowRequestBody = {
	postStatus: string | null;
	photo: { mediaHash: string; isNsfw: boolean } | null;
};

/**
 * Reads a RightNowRequestBody: {requestId, requestCreatedAt,
 * requestUpdatedAt, postStatus, postId, medias: [{mediaHash, isNsfw}]}.
 */
export function parseRightNowRequestBody(body: unknown): RightNowRequestBody {
	const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
	const medias = Array.isArray(b.medias) ? b.medias : [];
	let photo: RightNowRequestBody["photo"] = null;
	for (const media of medias) {
		const m = (media && typeof media === "object" ? media : {}) as Record<string, unknown>;
		if (typeof m.mediaHash === "string" && validateMediaHash(m.mediaHash)) {
			photo = { mediaHash: m.mediaHash, isNsfw: m.isNsfw === true };
			break;
		}
	}
	return {
		postStatus: typeof b.postStatus === "string" ? b.postStatus : null,
		photo,
	};
}

/**
 * A "RightNowRequest" message, as a cover card like the album / shared-profile
 * cards: the post's photo (or the Right Now color) as cover. Receive-only on
 * the API side: the post's author sends it by accepting a Right Now request,
 * which also opens this chat. So "mine" means we accepted their request to our
 * discreet post.
 */
export function RightNowRequestCard({ body, mine, tailCorner, meta }: { body: unknown; mine: boolean; tailCorner: string; meta: ReactNode }) {
	const { t } = useTranslation();
	const { rightNow: blurRightNowMedia } = useMediaBlur();
	const { data: mySettings } = useMySettings();
	const { postStatus, photo: rawPhoto } = parseRightNowRequestBody(body);
	// An explicit photo is not shown at all unless "Explicit Images in Right
	// Now" is on. "mine" means the photo is from our own post.
	const photo = rawPhoto && rawPhoto.isNsfw && !mine && mySettings?.viewRightNowNsfw !== true ? null : rawPhoto;
	const [photoFailed, setPhotoFailed] = useState(false);
	// postStatus is opaque per the API docs; only the two obvious values are shown.
	const statusLabel =
		postStatus === "ACTIVE"
			? t("chat.thread.right_now_post_active", { defaultValue: "Post is live" })
			: postStatus === "EXPIRED"
				? t("chat.thread.right_now_post_ended", { defaultValue: "Post has ended" })
				: null;
	const shouldBlurPhoto = photo != null && blurRightNowMedia;

	const content = {
		title: t("chat.thread.right_now_request", { defaultValue: "Right Now request" }),
		text: mine
			? t("chat.thread.right_now_request_mine", { defaultValue: "You accepted their request to your discreet post." })
			: t("chat.thread.right_now_request_theirs", { defaultValue: "Accepted your Right Now request." }),
		status: statusLabel ? (
			<>
				<span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", postStatus === "ACTIVE" ? "bg-green-500" : "bg-current opacity-60")} />
				<span className="truncate">{statusLabel}</span>
			</>
		) : null,
		meta,
		tailCorner,
	};

	// No photo (or it failed to load): the compact card, not an empty cover.
	if (!photo || photoFailed) return <ChatCompactCard {...content} icon={<RightNowIcon />} tint="var(--right-now)" />;

	return (
		<ChatCoverCard
			{...content}
			cover={
				<div className="group/reveal h-full w-full">
					<img
						src={getThumbImageUrl(photo.mediaHash, "480x480")}
						alt=""
						onError={() => setPhotoFailed(true)}
						className={cn("h-full w-full object-cover", shouldBlurPhoto && `${PRIVACY_BLUR_CLASS} ${PRIVACY_HOVER_REVEAL_CLASS}`)}
					/>
				</div>
			}
			badge={<MediaBadge icon={<RightNowIcon />} label="Right Now" />}
		/>
	);
}

export const RIGHT_NOW_INCOMING_TYPE = "RightNowRequestIncoming";

type IncomingStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";

function incomingStatus(body: unknown): IncomingStatus {
	const s = body && typeof body === "object" ? (body as Record<string, unknown>).requestStatus : null;
	return s === "ACCEPTED" || s === "REJECTED" || s === "EXPIRED" ? s : "PENDING";
}

/**
 * A "RightNowRequestIncoming" message (Free Grind server, flag
 * right-now-chat-requests): someone asked to connect about our Right Now
 * post. Only we see it (the server hides it from the sender), so it's always
 * "theirs"; accept / decline go through the same call as the requests sheet.
 * The status follows live (dynamic message): accepting also sends the regular
 * "RightNowRequest" message that opens the chat for them. The cover is the
 * post's Right Now media (our own post), never a profile photo.
 */
export function RightNowIncomingRequestCard({ body, tailCorner, meta }: { body: unknown; tailCorner: string; meta: ReactNode }) {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const queryClient = useQueryClient();
	const [answering, setAnswering] = useState<"ACCEPTED" | "REJECTED" | null>(null);
	const status = incomingStatus(body);
	const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
	const requestId = Number(b.requestId);
	const { rightNow: blurRightNowMedia } = useMediaBlur();
	// Our own post's photo: shown even if explicit (like the accepted card's "mine").
	const { photo } = parseRightNowRequestBody(body);
	const [photoFailed, setPhotoFailed] = useState(false);
	const onCover = photo != null && !photoFailed;

	const answer = (next: "ACCEPTED" | "REJECTED") => async (event: React.MouseEvent) => {
		event.stopPropagation();
		if (!Number.isSafeInteger(requestId) || answering) return;
		haptic(10);
		setAnswering(next);
		try {
			await apiFunctions.respondToRightNowRequest(requestId, next);
			if (next === "ACCEPTED") toast.success(t("right_now.request_accepted_toast", { defaultValue: "Request accepted, a chat has been opened" }));
		} catch (error) {
			toast.error(
				error instanceof RightNowPostGoneError
					? t("right_now.request_answer_post_gone", { defaultValue: "Your post has ended, so this request can't be answered anymore" })
					: error instanceof Error
						? error.message
						: t("right_now.request_answer_error", { defaultValue: "Could not answer the request" }),
			);
		} finally {
			setAnswering(null);
			void queryClient.invalidateQueries({ queryKey: ["rightnow", "requests", "inbox"] });
		}
	};

	const statusText =
		status === "ACCEPTED"
			? t("right_now.chat_request.status_accepted")
			: status === "REJECTED"
				? t("right_now.chat_request.status_rejected")
				: status === "EXPIRED"
					? t("right_now.chat_request.status_expired")
					: null;
	const content = {
		title: t("chat.thread.right_now_request", { defaultValue: "Right Now request" }),
		text: t("right_now.chat_request.text"),
		status: statusText ? (
			<>
				<span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status === "ACCEPTED" ? "bg-green-500" : "bg-current opacity-60")} />
				<span className="truncate">{statusText}</span>
			</>
		) : null,
		actions:
			status === "PENDING" && Number.isSafeInteger(requestId)
				? [
						<button key="accept" type="button" disabled={answering != null} onClick={answer("ACCEPTED")} className={cardButtonClass({ primary: true, onCover })}>
							{answering === "ACCEPTED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
							<span className="truncate">{t("right_now.chat_request.accept")}</span>
						</button>,
						<button key="reject" type="button" disabled={answering != null} onClick={answer("REJECTED")} className={cardButtonClass({ onCover })}>
							{answering === "REJECTED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
							<span className="truncate">{t("right_now.chat_request.reject")}</span>
						</button>,
					]
				: undefined,
		meta,
		tailCorner,
	};

	if (!onCover) return <ChatCompactCard {...content} icon={<RightNowIcon />} tint="var(--right-now)" />;
	return (
		<ChatCoverCard
			{...content}
			cover={
				<div className="group/reveal h-full w-full">
					<img
						src={getThumbImageUrl(photo.mediaHash, "480x480")}
						alt=""
						onError={() => setPhotoFailed(true)}
						className={cn("h-full w-full object-cover", blurRightNowMedia && `${PRIVACY_BLUR_CLASS} ${PRIVACY_HOVER_REVEAL_CLASS}`)}
					/>
				</div>
			}
			badge={<MediaBadge icon={<RightNowIcon />} label="Right Now" />}
		/>
	);
}
