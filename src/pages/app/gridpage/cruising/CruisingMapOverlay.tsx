import { MapPinPlus } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { useAuth } from "../../../../contexts/useAuth";
import { useMyOwnProfile } from "../../../../hooks/queries/useProfileQueries";
import type { BrowseCard } from "../../../../types/grid";
import { getThumbImageUrl } from "../../../../utils/media";
import { getProfilePhotoHash } from "../../profile-editor/profileEditorUtils";
import { useCruisingSpots, useCruisingSpotsEnabled } from "../../../../hooks/queries/useCruisingQueries";
import { useOwnMapPosition } from "../../../../hooks/queries/useOwnMapPosition";
import { useIsAnyBottomSheetOpen } from "../../../../components/ui/bottom-sheet";
import { cn } from "../../../../utils/cn";
import { encodeGeohash } from "../../../../utils/geohash";
import { cruisingCategoryIcon } from "./cruisingCategories";
import { CruisingSpotSheet, ownPosition } from "./CruisingSpotSheet";
import { SuggestCruisingSpotSheet } from "./SuggestCruisingSpotSheet";

/**
 * Page side of the cruising spots and the own map presence, shared by the
 * grid map and the Right Now map: which spots to load, the selected spot, the
 * suggest flow, and the bar over the map (check-in pill, suggest button) with
 * the spot and suggestion sheets.
 */

type LatLon = { lat: number; lon: number };

/** The own profile as a map card (photo, name), like the own tile in the grid. */
export function useOwnMapCard(): BrowseCard | null {
	const { userId } = useAuth();
	const { data: myProfile } = useMyOwnProfile();
	const photoHash = useMemo(() => getProfilePhotoHash(myProfile), [myProfile]);
	const displayName = myProfile?.displayName ?? null;
	return useMemo(() => {
		if (!userId) return null;
		return {
			profileId: String(userId),
			displayName: displayName ?? undefined,
			primaryImageUrl: photoHash ? getThumbImageUrl(photoHash, "320x320") : undefined,
			onlineUntil: Date.now() + 60 * 60 * 1000,
			distanceMeters: 0,
		};
	}, [userId, displayName, photoHash]);
}

/**
 * Where others see us on the map (Free Grind server). With GPS location the
 * map also shows the real position with a leash to it (`selfFuzzRadiusMeters` set).
 */
export function useOwnMapPresence(enabled: boolean) {
	const { useAutoLocation } = usePreferences();
	const { data } = useOwnMapPosition(enabled);
	const selfMapPosition = useMemo<LatLon | null>(
		() => (data?.visible && data.lat != null && data.lon != null ? { lat: data.lat, lon: data.lon } : null),
		[data],
	);
	const selfFuzzRadiusMeters = useAutoLocation && selfMapPosition ? (data?.radiusMeters ?? null) : null;
	return { selfMapPosition, selfFuzzRadiusMeters };
}

/**
 * Cruising spots for a map (flag `cruising-spots`). They're listed around the
 * map center, coarsened to a geohash-4 cell (~20–40 km), so panning only
 * refetches when it leaves that cell. `fallbackCenter` stands in until the
 * map reported its center.
 */
export function useCruisingMapState(mapShown: boolean, fallbackCenter: LatLon | null = null) {
	const { geohash, showCruisingSpots } = usePreferences();
	const isEnabled = useCruisingSpotsEnabled();
	const enabled = mapShown && isEnabled;
	const mapCenterRef = useRef<LatLon | null>(null);
	const [mapCenterCell, setMapCenterCell] = useState<string | null>(null);
	const handleCenterChange = useCallback((center: LatLon) => {
		mapCenterRef.current = center;
		setMapCenterCell(encodeGeohash(center.lat, center.lon).slice(0, 4));
	}, []);
	const cell = useMemo(() => {
		if (mapCenterCell) return mapCenterCell;
		const at = fallbackCenter ?? ownPosition(geohash);
		return at ? encodeGeohash(at.lat, at.lon).slice(0, 4) : null;
	}, [mapCenterCell, fallbackCenter, geohash]);
	const { data } = useCruisingSpots(cell, enabled);
	// Layer switched off (filter sheet): no spots on the map; a running check-in still shows.
	const spots = useMemo(() => (enabled && showCruisingSpots ? (data?.spots ?? []) : []), [enabled, showCruisingSpots, data]);
	const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
	const [isSuggesting, setIsSuggesting] = useState(false);
	useEffect(() => {
		if (enabled) return;
		setSelectedSpotId(null);
		setIsSuggesting(false);
	}, [enabled]);
	return {
		enabled,
		layerVisible: showCruisingSpots,
		data,
		spots,
		checkIn: data?.checkIn ?? null,
		selectedSpotId,
		setSelectedSpotId,
		isSuggesting,
		setIsSuggesting,
		handleCenterChange,
		mapCenterRef,
	};
}

export type CruisingMapState = ReturnType<typeof useCruisingMapState>;

type OverlayProps = {
	state: CruisingMapState;
	onOpenProfile: (profileId: string) => void;
	/** Before the suggestion sheet opens (e.g. close a selected profile or post). */
	onBeforeSuggest?: () => void;
	/** Positions the bar (bottom offset per page); default: just above the bottom nav. */
	barClassName?: string;
	/** Hides the bar (e.g. while a map card covers the bottom). The sheets stay. */
	hideBar?: boolean;
};

/** The bar over the map (check-in pill centered, suggest button on the right) and the spot sheets. */
export function CruisingMapOverlay({ state, onOpenProfile, onBeforeSuggest, barClassName, hideBar = false }: OverlayProps) {
	const { t } = useTranslation();
	// The bar floats over the map: step aside for every open sheet.
	const isSheetOpen = useIsAnyBottomSheetOpen();
	// A profile tapped in the spot sheet, opened once that sheet is gone.
	const pendingProfileRef = useRef<string | null>(null);
	if (!state.enabled) return null;
	const { data, checkIn, spots } = state;
	const checkedInSpot = checkIn ? (spots.find((spot) => spot.id === checkIn.spotId) ?? null) : null;
	const CheckedInIcon = cruisingCategoryIcon(checkedInSpot?.category ?? "other");

	return (
		<>
			{/* Render this at page level, not inside a map's (full-bleed) wrapper, so `fixed` centers on the viewport. */}
			{!hideBar && !isSheetOpen ? (
				<div
					className={cn(
						"pointer-events-none fixed end-0 start-[var(--nav-rail-width,0px)] z-[50] px-4",
						barClassName ?? "bottom-[calc(var(--nav-height,var(--safe-area-bottom))+0.75rem)] rail:bottom-[var(--page-bottom)]",
					)}
				>
					{/* Check-in pill centered; the suggest button on the right, mirrored by an empty column on the left. */}
					<div className="grid w-full grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2">
						<span aria-hidden="true" />
						{checkIn ? (
							<button
								type="button"
								onClick={() => state.setSelectedSpotId(checkIn.spotId)}
								className="pointer-events-auto flex min-w-0 max-w-full items-center gap-2 justify-self-center rounded-full border border-[var(--border)] bg-[var(--surface)]/95 py-1.5 pe-4 ps-1.5 text-sm font-semibold text-[var(--text)] shadow-lg backdrop-blur transition active:scale-95"
							>
								<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
									<CheckedInIcon weight="fill" className="h-4 w-4" />
								</span>
								<span className="truncate">{checkedInSpot ? t("cruising.checked_in_at", { name: checkedInSpot.name }) : t("cruising.checked_in")}</span>
							</button>
						) : (
							<span aria-hidden="true" />
						)}
						{data?.canSuggest && state.layerVisible ? (
							<button
								type="button"
								onClick={() => {
									state.setSelectedSpotId(null);
									onBeforeSuggest?.();
									state.setIsSuggesting(true);
								}}
								aria-label={t("cruising.suggest_title")}
								title={t("cruising.suggest_title")}
								className="pointer-events-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg transition active:scale-95"
							>
								<MapPinPlus weight="fill" className="h-6 w-6" />
							</button>
						) : (
							<span aria-hidden="true" />
						)}
					</div>
				</div>
			) : null}

			<CruisingSpotSheet
				spotId={state.selectedSpotId}
				listed={spots.find((spot) => spot.id === state.selectedSpotId) ?? null}
				myCheckIn={checkIn}
				checkInRadiusMeters={data?.checkInRadiusMeters ?? 300}
				checkInMinutes={data?.checkInMinutes ?? 120}
				confirmationsNeeded={data?.confirmationsNeeded ?? 3}
				rejectionsNeeded={data?.rejectionsNeeded ?? 3}
				voteRadiusMeters={data?.voteRadiusMeters ?? 2000}
				onClose={() => state.setSelectedSpotId(null)}
				// The spot sheet is portaled above the page: close it first, then open the
				// profile — once the sheet's history entry is popped, or that back step
				// would close the profile right away.
				onOpenProfile={(profileId) => {
					pendingProfileRef.current = profileId;
					state.setSelectedSpotId(null);
				}}
				onClosed={() => {
					const profileId = pendingProfileRef.current;
					pendingProfileRef.current = null;
					if (profileId) onOpenProfile(profileId);
				}}
			/>
			<SuggestCruisingSpotSheet
				isOpen={state.isSuggesting}
				startLocation={state.mapCenterRef.current}
				onClose={() => state.setIsSuggesting(false)}
				onSubmitted={() => state.setIsSuggesting(false)}
			/>
		</>
	);
}
