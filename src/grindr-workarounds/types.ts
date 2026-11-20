import type { ComponentType } from "react";
import type { InterestItem } from "../pages/app/interest/interestUtils";
import type { BrowseCard } from "../pages/app/GridPage.types";
import type { ExpiringMediaKind } from "../services/expiringAllowance";

/** A viewer the server named: the eyeball endpoint or a `viewed_me` WebSocket event. */
export type NamedView = { profileId: string; imageHash: string | null; timestamp: number };

/**
 * A paid action that Grindr may refuse, passed to retryPaidAction. The
 * workaround words its prompt from it, so core code carries no bypass texts.
 */
export type PaidActionReason = "message" | "expiring_photo" | "expiring_video" | "unsend" | "album_share" | "expiring_album_share";

export type ViewsApi = {
	getViewsEyeball(): Promise<NamedView | null>;
	getProfilesByIds(profileIds: (string | number)[]): Promise<unknown>;
};

/**
 * What a Grindr workaround can plug into. Every hook is optional, and the app
 * behaves like the official one where none is given.
 */
export type GrindrWorkaround = {
	/** Kebab-case name, for logs. */
	id: string;

	// --- Paid features ---
	/** Runs a paid action; may retry it when the server refuses it as paid. Default: just runs it. */
	retryPaidAction?: <T>(reason: PaidActionReason, action: () => Promise<T>) => Promise<T>;
	/** Location-reporting requests wait for this. Default: resolved. */
	awaitHomeLocation?: () => Promise<void>;
	/** Runs before the session is signed out. */
	beforeSignOut?: () => Promise<void>;
	/** Whether a used-up expiring allowance can still be got past on send. Default: false. */
	canBypassExpiringLimit?: (kind: ExpiringMediaKind) => boolean;

	// --- Profile views ---
	/** Runs alongside the views fetch (e.g. extra lookups). */
	prepareViews?: (api: ViewsApi) => Promise<void>;
	/**
	 * Turns the views list as the server returned it (null: unusable response)
	 * into the one shown. Default: the server's list as is.
	 */
	enhanceViews?: (input: { views: InterestItem[] | null; taps: InterestItem[]; api: ViewsApi }) => Promise<InterestItem[]>;
	/** A `viewed_me` WebSocket event arrived; awaited before the views list refetches. */
	onViewReceived?: (view: NamedView) => Promise<void>;
	/** Browse grid cards loaded. */
	onBrowseCards?: (cards: BrowseCard[]) => void;
	/** Locked view previews show their photo unblurred. Default: blurred, like the official app. */
	showLockedPreviewPhotos?: boolean;
	/** Shown once on the Views tab while `visible`. */
	ViewsIntro?: ComponentType<{ visible: boolean }>;

	// --- Blocking ---
	/** Profiles the server marks as not blockable (`isBlockable: false`) can be blocked anyway. Default: they can only be hidden. */
	allowBlockingAnyProfile?: boolean;

	// --- Lifecycle (they only keep local state in order) ---
	/** The signed-in account changed (null: signed out). */
	onActiveUser?: (profileId: number | string | null) => void;

	// --- UI mounted by App ---
	/** Rendered app-wide, also before sign-in (e.g. prompts). */
	Overlay?: ComponentType;
	/** Rendered once signed in, after startup settled. */
	SignedInBridge?: ComponentType;
};
