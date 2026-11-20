import { useCallback, useEffect, useRef } from "react";
import type { Map as MaplibreMap, Marker } from "maplibre-gl";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { useProfilePhotoPrivacy } from "../../../../hooks/useProfilePhotoPrivacy";
import type { BrowseCard } from "../../../../types/grid";
import { setCrashContext } from "../../../../utils/crashContext";
import { formatDistance } from "../utils";
import type { CruisingSpot } from "../../../../services/api/cruisingMethods";
import { useMapSelfAndSpots } from "../cruising/useMapSelfAndSpots";
import { buildProfileMarker, isCardOnline } from "./mapProfileMarker";
import { MAP_STYLE_DARK, applyDarkMapTheme, relaxRoadZoomThresholds } from "./mapStyles";

/**
 * Grid map view. Shows profiles that
 * share a map position — the point the server obfuscated (stable per user,
 * computed server-side). The client never learns the fuzz radius or the real
 * position, so nothing here can be used to narrow either down.
 * Reuses the Right Now marker styles (.rn-* in index.css).
 *
 * The own profile, its anchor and the cruising spots (Free Grind server) come
 * from useMapSelfAndSpots, shared with the Right Now map.
 */

export type MapCard = BrowseCard & { fuzzedLat: number; fuzzedLon: number };

export function hasCardPosition(card: BrowseCard): card is MapCard {
	return (
		typeof card.fuzzedLat === "number" && Number.isFinite(card.fuzzedLat) &&
		typeof card.fuzzedLon === "number" && Number.isFinite(card.fuzzedLon)
	);
}

type Props = {
	cards: MapCard[];
	selectedProfileId: string | null;
	onSelectProfile: (profileId: string | null) => void;
	/**
	 * Explore mode: the pin the cascade is loaded around. A tap anywhere on the
	 * map moves it (onPlacePin), which also makes that spot the explore location.
	 */
	explorePin?: { lat: number; lon: number } | null;
	onPlacePin?: (point: { lat: number; lon: number }) => void;
	/** Height (px) covered by the page header at the top of the full-bleed map. */
	topInset: number;
	/** Width (px) covered by the desktop nav rail at the left of the map. */
	leftInset?: number;
	/** The own profile, shown at the own location; a tap selects it like any profile. */
	selfCard?: BrowseCard | null;
	/** Cruising spots (Free Grind server). */
	spots?: CruisingSpot[];
	selectedSpotId?: string | null;
	/** The spot the user is checked in at (highlighted). */
	checkedInSpotId?: string | null;
	onSelectSpot?: (spotId: string) => void;
	/** The visual map center after every move (and once loaded). */
	onCenterChange?: (center: { lat: number; lon: number }) => void;
	/** Where others see the own profile (the server's obfuscated point); the own marker sits there. Default: the own location. */
	selfMapPosition?: { lat: number; lon: number } | null;
	/**
	 * Randomizer radius (m): while it's set, the real position gets an anchor
	 * dot and a leash runs to the own marker (the radius itself isn't drawn).
	 */
	selfFuzzRadiusMeters?: number | null;
};

const NO_SPOTS: CruisingSpot[] = [];
const MAX_PIXEL_RATIO = 2;
const MAX_TILE_CACHE_SIZE = 64;
/** Name plates for everyone from street level on (same as the Right Now map). */
const NAMEPLATE_ZOOM = 16;

function buildPinMarker(): HTMLDivElement {
	const el = document.createElement("div");
	el.style.cssText = "width:24px;height:32px;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));";
	el.innerHTML = `<svg viewBox="0 0 24 32" width="24" height="32"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 32 12 32s12-11.5 12-20.3C24 5.2 18.6 0 12 0Z" fill="var(--explore, #8b5cf6)"/><circle cx="12" cy="11.5" r="4.5" fill="#fff"/></svg>`;
	return el;
}

export function GridMap({
	cards,
	selectedProfileId,
	onSelectProfile,
	explorePin = null,
	onPlacePin,
	topInset,
	leftInset = 0,
	selfCard = null,
	spots = NO_SPOTS,
	selectedSpotId = null,
	checkedInSpotId = null,
	onSelectSpot,
	onCenterChange,
	selfMapPosition = null,
	selfFuzzRadiusMeters = null,
}: Props) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const privacy = useProfilePhotoPrivacy();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<MaplibreMap | null>(null);
	const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
	const markersRef = useRef(new Map<string, { marker: Marker; signature: string }>());
	const cardsRef = useRef(cards);
	cardsRef.current = cards;
	const onSelectRef = useRef(onSelectProfile);
	onSelectRef.current = onSelectProfile;
	const onPlacePinRef = useRef(onPlacePin);
	onPlacePinRef.current = onPlacePin;
	const onCenterChangeRef = useRef(onCenterChange);
	onCenterChangeRef.current = onCenterChange;
	const pinRef = useRef<Marker | null>(null);
	const explorePinRef = useRef(explorePin);
	explorePinRef.current = explorePin;
	const privacyRef = useRef(privacy);
	privacyRef.current = privacy;
	const insetsRef = useRef({ top: topInset, left: leftInset });
	insetsRef.current = { top: topInset, left: leftInset };
	const labelFor = useRef<(c: BrowseCard) => string>(() => "");
	labelFor.current = (c) => {
		const name = c.displayName?.trim() || t("common.unknown_display_name");
		const distance = c.distanceMeters != null ? formatDistance(c.distanceMeters, t, unitsPreset) : null;
		return distance ? `${name} · ${distance}` : name;
	};

	const selfId = selfCard ? String(selfCard.profileId) : null;
	const extras = useMapSelfAndSpots(mapRef, maplibreRef, {
		selfCard,
		selfMapPosition,
		selfFuzzRadiusMeters,
		onSelectSelf: selfId ? () => onSelectRef.current(selfId) : undefined,
		spots,
		checkedInSpotId,
		onSelectSpot,
	});
	const extrasRef = useRef(extras);
	extrasRef.current = extras;
	const ownCenterRef = useRef(extras.ownCenter);
	ownCenterRef.current = extras.ownCenter;

	const syncMarkers = useCallback(() => {
		const map = mapRef.current;
		const maplibregl = maplibreRef.current;
		if (!map || !maplibregl) return;
		const markers = markersRef.current;
		const next = new Set<string>();
		for (const card of cardsRef.current) {
			const id = String(card.profileId);
			next.add(id);
			const label = labelFor.current(card);
			const signature = [card.fuzzedLat, card.fuzzedLon, card.primaryImageUrl ?? "", isCardOnline(card), label, privacyRef.current].join("|");
			const existing = markers.get(id);
			if (existing?.signature === signature) continue;
			existing?.marker.remove();
			const element = buildProfileMarker(card, label, privacyRef.current, () => onSelectRef.current(id));
			markers.set(id, { marker: new maplibregl.Marker({ element, anchor: "center" }).setLngLat([card.fuzzedLon, card.fuzzedLat]).addTo(map), signature });
		}
		for (const [id, entry] of markers) {
			if (!next.has(id)) {
				entry.marker.remove();
				markers.delete(id);
			}
		}
		setCrashContext("gridMapMarkers", markers.size);
	}, []);

	const syncPin = useCallback(() => {
		const map = mapRef.current;
		const maplibregl = maplibreRef.current;
		if (!map || !maplibregl) return;
		const pin = explorePinRef.current;
		if (!pin) {
			pinRef.current?.remove();
			pinRef.current = null;
			return;
		}
		if (!pinRef.current) pinRef.current = new maplibregl.Marker({ element: buildPinMarker(), anchor: "bottom" }).setLngLat([pin.lon, pin.lat]).addTo(map);
		else pinRef.current.setLngLat([pin.lon, pin.lat]);
	}, []);

	const applySelection = useCallback(
		(id: string | null, spotId: string | null) => {
			let any = extrasRef.current.markSelection(spotId, id != null && id === selfId);
			for (const [markerId, entry] of markersRef.current) {
				const el = entry.marker.getElement();
				const selected = markerId === id;
				any ||= selected;
				const root = el.classList.contains("rn-marker") ? el : el.querySelector<HTMLElement>(".rn-marker");
				if (root) root.dataset.selected = selected ? "true" : "false";
				el.style.zIndex = selected ? "10" : "";
			}
			containerRef.current?.classList.toggle("rn-map-has-selection", any);
		},
		[selfId],
	);

	useEffect(() => {
		let mounted = true;
		const container = containerRef.current;
		const init = async () => {
			try {
				const maplibregl = (await import("maplibre-gl")).default;
				await import("maplibre-gl/dist/maplibre-gl.css");
				if (!mounted || !containerRef.current || mapRef.current) return;
				maplibreRef.current = maplibregl;
				const first = cardsRef.current[0];
				const pin = explorePinRef.current;
				const start: [number, number] | null = pin ? [pin.lon, pin.lat] : (ownCenterRef.current ?? (first ? [first.fuzzedLon, first.fuzzedLat] : null));
				const map = new maplibregl.Map({
					container: containerRef.current,
					style: MAP_STYLE_DARK,
					center: start ?? [10, 50],
					zoom: start ? 13 : 3,
					attributionControl: false,
					pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
					maxTileCacheSize: MAX_TILE_CACHE_SIZE,
				});
				map.on("style.load", () => {
					relaxRoadZoomThresholds(map);
					applyDarkMapTheme(map);
				});
				map.on("load", () => extrasRef.current.syncAnchor());
				// Header and nav rail overlay the full-bleed map: keep the
				// visual center (and "You") in the uncovered part.
				map.setPadding({ top: insetsRef.current.top, left: insetsRef.current.left, right: 0, bottom: 0 });
				map.on("click", (event) => {
					onSelectRef.current(null);
					// Explore mode: a tap on the map (not on a profile) moves the pin there.
					onPlacePinRef.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
				});
				const updateZoomClass = () => containerRef.current?.classList.toggle("rn-map-zoomed", map.getZoom() >= NAMEPLATE_ZOOM);
				map.on("zoom", updateZoomClass);
				map.once("load", updateZoomClass);
				const reportCenter = () => {
					const center = map.getCenter();
					onCenterChangeRef.current?.({ lat: center.lat, lon: center.lng });
				};
				map.on("moveend", reportCenter);
				map.once("load", reportCenter);
				mapRef.current = map;
				setCrashContext("gridMap", "open");
				extrasRef.current.sync();
				syncMarkers();
				syncPin();
			} catch {
				// map stays blank; the list view is still available
			}
		};
		void init();
		const resizeObserver = "ResizeObserver" in window && container ? new ResizeObserver(() => mapRef.current?.resize()) : null;
		if (container) resizeObserver?.observe(container);
		const markers = markersRef.current;
		return () => {
			mounted = false;
			resizeObserver?.disconnect();
			for (const entry of markers.values()) entry.marker.remove();
			markers.clear();
			extrasRef.current.teardown();
			pinRef.current?.remove();
			pinRef.current = null;
			mapRef.current?.remove();
			mapRef.current = null;
			setCrashContext("gridMap", null);
			setCrashContext("gridMapMarkers", null);
		};
		// Created once; updates are applied to the live instance below.
	}, []);

	useEffect(() => {
		syncMarkers();
		applySelection(selectedProfileId, selectedSpotId);
		// spotHosts: spot markers mount through portals after syncing; mark the selection once they exist.
	}, [cards, selectedProfileId, selectedSpotId, privacy, extras.spotHosts, syncMarkers, applySelection]);

	useEffect(() => {
		syncPin();
	}, [explorePin?.lat, explorePin?.lon, syncPin]);

	useEffect(() => {
		mapRef.current?.setPadding({ top: topInset, left: leftInset, right: 0, bottom: 0 });
	}, [topInset, leftInset]);

	return (
		<div className="relative h-full w-full">
			<div ref={containerRef} className="fg-grid-map absolute inset-0" style={{ isolation: "isolate" }} />
			{extras.portals}
		</div>
	);
}
