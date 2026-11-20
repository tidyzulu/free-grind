import { useEffect } from "react";

import { restoreStrandedLocation } from "./bypass";

/**
 * Once the user is signed in, repairs a server-side location left parked in
 * Honduras by an entitlement bypass that was interrupted before it could move
 * back home (open-grind #446). Renders nothing; runs the recovery once on mount.
 */
export function StrandedLocationRepair(): null {
	useEffect(() => {
		void restoreStrandedLocation();
	}, []);
	return null;
}
