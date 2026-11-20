import type { GrindrWorkaround } from "../types";
import { awaitEntitlementGrant, restoreStrandedLocation, withEntitlementBypass } from "./bypass";
import { BypassPrompt } from "./BypassPrompt";
import { StrandedLocationRepair } from "./StrandedLocationRepair";

/**
 * The Honduras entitlement bypass: a paid action Grindr refuses is offered a
 * retry from Honduras, where those features are free (see bypass.ts). Rust
 * side: src-tauri/src/api/entitlements.rs.
 */
export const entitlementBypass: GrindrWorkaround = {
	id: "entitlement-bypass",
	retryPaidAction: withEntitlementBypass,
	// No location is reported while the server-side one is parked in Honduras.
	awaitHomeLocation: awaitEntitlementGrant,
	// Repair a location left parked in Honduras before the session goes away,
	// so the account isn't stranded there after sign-out (#446).
	beforeSignOut: restoreStrandedLocation,
	// Grindr refuses expiring album shares even from Honduras.
	canBypassExpiringLimit: (kind) => kind !== "albums",
	Overlay: BypassPrompt,
	SignedInBridge: StrandedLocationRepair,
};
