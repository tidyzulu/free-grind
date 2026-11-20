/**
 * Grindr-specific workarounds: ways around limits of Grindr's servers (paid
 * features, locked view previews). The rest of the app imports only from this
 * file, and each workaround lives in its own folder here.
 *
 * Removing one: delete its folder and its line in WORKAROUNDS below. Every
 * hook falls back to the official app's behaviour, so nothing else changes.
 */
import { createElement, Fragment } from "react";
import type { GrindrWorkaround, NamedView, PaidActionReason, ViewsApi } from "./types";
import type { InterestItem } from "../pages/app/interest/interestUtils";
import { mergeViews, sortByNewest } from "../pages/app/interest/interestUtils";
import type { BrowseCard } from "../pages/app/GridPage.types";
import type { ExpiringMediaKind } from "../services/expiringAllowance";
import { entitlementBypass } from "./entitlement-bypass";
import { viewRecovery } from "./view-recovery";
import { lockedPreviewPhotos } from "./locked-preview-photos";
import { blockAnyProfile } from "./block-any-profile";

const WORKAROUNDS: readonly GrindrWorkaround[] = [entitlementBypass, viewRecovery, lockedPreviewPhotos, blockAnyProfile];

export type { NamedView, PaidActionReason, ViewsApi } from "./types";

function active(): readonly GrindrWorkaround[] {
	return WORKAROUNDS;
}

// A hook in name only (no React state), kept so call sites read as hooks.
function useActive(): readonly GrindrWorkaround[] {
	return WORKAROUNDS;
}

/** The first active workaround that implements `key`. */
function find<K extends keyof GrindrWorkaround>(key: K): NonNullable<GrindrWorkaround[K]> | undefined {
	for (const workaround of active()) {
		const hook = workaround[key];
		if (hook !== undefined) return hook as NonNullable<GrindrWorkaround[K]>;
	}
	return undefined;
}

// --- Paid features ---

export function retryPaidAction<T>(reason: PaidActionReason, action: () => Promise<T>): Promise<T> {
	const retry = find("retryPaidAction");
	return retry ? retry(reason, action) : action();
}

export function awaitHomeLocation(): Promise<void> {
	return find("awaitHomeLocation")?.() ?? Promise.resolve();
}

export async function beforeSignOut(): Promise<void> {
	await Promise.all(active().map((workaround) => workaround.beforeSignOut?.()));
}

export function useCanBypassExpiringLimit(kind: ExpiringMediaKind): boolean {
	return useActive().some((workaround) => workaround.canBypassExpiringLimit?.(kind) === true);
}

// --- Profile views ---

export async function prepareViews(api: ViewsApi): Promise<void> {
	await Promise.all(active().map((workaround) => workaround.prepareViews?.(api)));
}

/** The views list to show: the server's own, unless a workaround enhances it. */
export function enhanceViews(input: { views: InterestItem[] | null; taps: InterestItem[]; api: ViewsApi }): Promise<InterestItem[]> {
	const enhance = find("enhanceViews");
	if (enhance) return enhance(input);
	return Promise.resolve(sortByNewest(mergeViews([], input.views ?? []).values()));
}

export async function onViewReceived(view: NamedView): Promise<void> {
	await Promise.all(active().map((workaround) => workaround.onViewReceived?.(view)));
}

export function onBrowseCards(cards: BrowseCard[]): void {
	for (const workaround of active()) workaround.onBrowseCards?.(cards);
}

export function useShowLockedPreviewPhotos(): boolean {
	return useActive().some((workaround) => workaround.showLockedPreviewPhotos === true);
}

export function ViewsIntro({ visible }: { visible: boolean }) {
	const intro = useActive().find((workaround) => workaround.ViewsIntro)?.ViewsIntro;
	return intro ? createElement(intro, { visible }) : null;
}

// --- Blocking ---

/**
 * Whether a profile can be blocked, from its `isBlockable` (unknown counts as
 * blockable). Where it can't, the block action becomes a hide.
 */
export function useCanBlockProfile(): (isBlockable: boolean | null | undefined) => boolean {
	const allowAny = useActive().some((workaround) => workaround.allowBlockingAnyProfile === true);
	return (isBlockable) => allowAny || isBlockable !== false;
}

// --- Lifecycle: local state follows the account ---

export function setActiveUser(profileId: number | string | null): void {
	for (const workaround of WORKAROUNDS) workaround.onActiveUser?.(profileId);
}

// --- UI ---

export function GrindrWorkaroundOverlays() {
	const workarounds = useActive();
	return createElement(
		Fragment,
		null,
		...workarounds.flatMap((workaround) => (workaround.Overlay ? [createElement(workaround.Overlay, { key: workaround.id })] : [])),
	);
}

export function GrindrWorkaroundBridges() {
	const workarounds = useActive();
	return createElement(
		Fragment,
		null,
		...workarounds.flatMap((workaround) =>
			workaround.SignedInBridge ? [createElement(workaround.SignedInBridge, { key: workaround.id })] : [],
		),
	);
}

// --- Location finder (estimates a profile's position from its distance) ---

export { useLocateProfile, LocateProfileHost } from "./location-finder/useLocateProfile";
/** Whether "Locate" exists in this build (offered under Optional Features). */
export const LOCATE_PROFILE_AVAILABLE: boolean = true;
