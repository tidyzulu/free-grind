import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GeoJSONSource, Map as MaplibreMap, Marker } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import type { CruisingSpot } from "../../../../services/api/cruisingMethods";
import type { BrowseCard } from "../../../../types/grid";
import { decodeGeohash } from "../../../../utils/geohash";
import { buildProfileMarker } from "../components/mapProfileMarker";
import { CruisingSpotMarker } from "./CruisingSpotMarker";

/**
 * Shared by the grid map and the Right Now map: the own profile (at the point
 * others see it, else the own location), the anchor at the real position with
 * a leash to it, and the cruising spots (React content portaled into their
 * MapLibre markers). Stacking, bottom to top: anchor, spots, profiles. The map component owns the map; this keeps these extras
 * in sync with it.
 */

export type MapSelfAndSpotsOptions = {
	/** The own profile; null hides the own marker. */
	selfCard: BrowseCard | null;
	/** Where others see the own profile (the server's obfuscated point). Default: the own location. */
	selfMapPosition: { lat: number; lon: number } | null;
	/** Randomizer radius (m): while set, the real position gets an anchor dot and a leash to the own marker. */
	selfFuzzRadiusMeters: number | null;
	onSelectSelf?: () => void;
	spots: CruisingSpot[];
	checkedInSpotId: string | null;
	onSelectSpot?: (spotId: string) => void;
};

const LEASH_SOURCE = "fg-self-leash";
const LEASH_LAYER = "fg-self-leash";
const EMPTY_FEATURES: FeatureCollection = { type: "FeatureCollection", features: [] };
/** Same circle as a profile marker. */
const SPOT_MARKER_SIZE = 44;

/** The app accent as a concrete color (map paint can't read CSS variables). */
function accentColor(): string {
	return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f59e0b";
}

export function useMapSelfAndSpots(
	mapRef: MutableRefObject<MaplibreMap | null>,
	maplibreRef: MutableRefObject<typeof import("maplibre-gl") | null>,
	{ selfCard, selfMapPosition, selfFuzzRadiusMeters, onSelectSelf, spots, checkedInSpotId, onSelectSpot }: MapSelfAndSpotsOptions,
) {
	const { t } = useTranslation();
	const { geohash } = usePreferences();

	const ownCenter = useMemo<[number, number] | null>(() => {
		if (!geohash) return null;
		try {
			const { lat, lon } = decodeGeohash(geohash);
			return [(lon[0] + lon[1]) / 2, (lat[0] + lat[1]) / 2];
		} catch {
			return null;
		}
	}, [geohash]);

	const latest = useRef({ selfCard, selfMapPosition, selfFuzzRadiusMeters, onSelectSelf, spots, onSelectSpot, ownCenter });
	latest.current = { selfCard, selfMapPosition, selfFuzzRadiusMeters, onSelectSelf, spots, onSelectSpot, ownCenter };
	const selfRef = useRef<{ marker: Marker; signature: string } | null>(null);
	const anchorRef = useRef<Marker | null>(null);
	const spotMarkersRef = useRef(new Map<string, { marker: Marker; element: HTMLDivElement }>());
	const [spotHosts, setSpotHosts] = useState<{ id: string; element: HTMLDivElement }[]>([]);

	const syncSelf = useCallback(() => {
		const map = mapRef.current;
		const maplibregl = maplibreRef.current;
		if (!map || !maplibregl) return;
		const { selfCard: self, selfMapPosition: shown, ownCenter: real, onSelectSelf: onSelect } = latest.current;
		const at: [number, number] | null = shown ? [shown.lon, shown.lat] : real;
		if (!self || !at) {
			selfRef.current?.marker.remove();
			selfRef.current = null;
			return;
		}
		const label = t("browse_page.map_you", { defaultValue: "You" });
		const signature = [at[0], at[1], self.primaryImageUrl ?? "", label].join("|");
		if (selfRef.current?.signature === signature) return;
		selfRef.current?.marker.remove();
		// Your own photo is never blurred or hidden for you.
		const element = buildProfileMarker({ primaryImageUrl: self.primaryImageUrl, onlineUntil: self.onlineUntil }, label, "show", onSelect ? () => latest.current.onSelectSelf?.() : null, "fg-self-marker");
		selfRef.current = { marker: new maplibregl.Marker({ element, anchor: "center" }).setLngLat(at).addTo(map), signature };
	}, [mapRef, maplibreRef, t]);

	/**
	 * Anchor dot at the real position and a leash to where the own profile is
	 * shown, while both are known and the randomizer is on. Its line layer is
	 * re-added after a style change (a new style drops custom layers).
	 */
	const syncAnchor = useCallback(() => {
		const map = mapRef.current;
		const maplibregl = maplibreRef.current;
		if (!map || !maplibregl || !map.isStyleLoaded()) return;
		const { ownCenter: real, selfMapPosition: shown, selfFuzzRadiusMeters: radius } = latest.current;
		const on = !!real && !!shown && radius != null && radius > 0;
		if (!map.getSource(LEASH_SOURCE)) {
			map.addSource(LEASH_SOURCE, { type: "geojson", data: EMPTY_FEATURES });
			map.addLayer({ id: LEASH_LAYER, type: "line", source: LEASH_SOURCE, layout: { "line-cap": "round" }, paint: { "line-color": accentColor(), "line-width": 2.5, "line-opacity": 0.9, "line-dasharray": [1, 2] } });
		}
		const leash = map.getSource(LEASH_SOURCE) as GeoJSONSource;
		if (!on) {
			leash.setData(EMPTY_FEATURES);
			anchorRef.current?.remove();
			anchorRef.current = null;
			return;
		}
		leash.setData({
			type: "FeatureCollection",
			features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [real, [shown.lon, shown.lat]] } }],
		});
		if (!anchorRef.current) {
			const element = document.createElement("div");
			element.className = "fg-self-anchor";
			anchorRef.current = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(real).addTo(map);
			// Markers stack in DOM order: right after the canvas, the anchor sits
			// below every marker (the own one included) instead of covering them.
			map.getCanvas().after(element);
		} else anchorRef.current.setLngLat(real);
	}, [mapRef, maplibreRef]);

	const syncSpots = useCallback(() => {
		const map = mapRef.current;
		const maplibregl = maplibreRef.current;
		if (!map || !maplibregl) return;
		const entries = spotMarkersRef.current;
		const next = new Set<string>();
		let changed = false;
		for (const spot of latest.current.spots) {
			next.add(spot.id);
			const existing = entries.get(spot.id);
			if (existing) {
				const at = existing.marker.getLngLat();
				if (at.lat !== spot.lat || at.lng !== spot.lon) existing.marker.setLngLat([spot.lon, spot.lat]);
				continue;
			}
			const element = document.createElement("div");
			element.className = "rn-marker fg-spot-marker";
			element.style.cssText = `width:${SPOT_MARKER_SIZE}px;height:${SPOT_MARKER_SIZE}px;cursor:pointer;`;
			const id = spot.id;
			element.addEventListener("click", (event) => {
				event.stopPropagation();
				latest.current.onSelectSpot?.(id);
			});
			entries.set(id, { marker: new maplibregl.Marker({ element, anchor: "center" }).setLngLat([spot.lon, spot.lat]).addTo(map), element });
			// Markers stack in DOM order: spots go right above the anchor (or the
			// canvas), below every profile marker. A selected one is raised by z-index.
			(anchorRef.current?.getElement() ?? map.getCanvas()).after(element);
			changed = true;
		}
		for (const [id, entry] of entries) {
			if (!next.has(id)) {
				entry.marker.remove();
				entries.delete(id);
				changed = true;
			}
		}
		if (changed) setSpotHosts([...entries].map(([id, entry]) => ({ id, element: entry.element })));
	}, [mapRef, maplibreRef]);

	/** Everything at once: call once the map exists. */
	const sync = useCallback(() => {
		syncSelf();
		syncAnchor();
		syncSpots();
	}, [syncSelf, syncAnchor, syncSpots]);

	useEffect(() => {
		sync();
	}, [sync, selfCard, ownCenter, spots, selfMapPosition?.lat, selfMapPosition?.lon, selfFuzzRadiusMeters]);

	/** Marks the selected spot (and the own marker); returns whether anything of these is selected. */
	const markSelection = useCallback((spotId: string | null, selfSelected: boolean): boolean => {
		let any = false;
		const mark = (el: HTMLElement, selected: boolean) => {
			any ||= selected;
			const root = el.classList.contains("rn-marker") ? el : el.querySelector<HTMLElement>(".rn-marker");
			if (root) root.dataset.selected = selected ? "true" : "false";
			el.style.zIndex = selected ? "10" : "";
		};
		for (const [id, entry] of spotMarkersRef.current) mark(entry.element, id === spotId);
		if (selfRef.current) mark(selfRef.current.marker.getElement(), selfSelected);
		return any;
	}, []);

	/** Removes all markers; for the map's own teardown. */
	const teardown = useCallback(() => {
		selfRef.current?.marker.remove();
		selfRef.current = null;
		anchorRef.current?.remove();
		anchorRef.current = null;
		for (const entry of spotMarkersRef.current.values()) entry.marker.remove();
		spotMarkersRef.current.clear();
	}, []);

	const spotsById = useMemo(() => new Map(spots.map((spot) => [spot.id, spot])), [spots]);
	const portals: ReactNode = spotHosts.map(({ id, element }) => {
		const spot = spotsById.get(id);
		if (!spot) return null;
		return createPortal(<CruisingSpotMarker spot={spot} label={spot.name} isCheckedIn={spot.id === checkedInSpotId} />, element, id);
	});

	return { sync, syncAnchor, markSelection, teardown, portals, spotHosts, ownCenter };
}
