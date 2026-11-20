import { ChevronRight, Loader2 } from "lucide-react";
import { MapPin } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { NATIVE_SHEET_BG } from "../../../../components/ui/action-sheet";
import { SHEET_FOOTER_CLASS, SheetClose, SheetCloseButton, sheetButtonClass } from "../../../../components/ui/bottom-sheet";
import { ControlledBottomSheet } from "../../../../components/ui/controlled-sheet";
import { SHEET_FIELD_CLASS, SheetChip, SheetSection, SheetTextInput } from "../../../../components/ui/sheet-section";
import { useSuggestCruisingSpot } from "../../../../hooks/queries/useCruisingQueries";
import { useDesktopBreakpoint } from "../../../../hooks/useDesktopBreakpoint";
import { CRUISING_DESCRIPTION_MAX, CRUISING_NAME_MAX, CRUISING_SPOT_CATEGORIES, type CruisingSpotCategory } from "../../../../services/api/cruisingMethods";
import { cn } from "../../../../utils/cn";
import { encodeGeohash } from "../../../../utils/geohash";
import { TravelDestinationSheet } from "../../profile-editor/TravelDestinationSheet";
import { reverseGeocodeGeohash } from "../geocoding";
import { CRUISING_CATEGORY_ICONS } from "./cruisingCategories";
import { cruisingErrorText } from "./CruisingSpotSheet";

type LatLon = { lat: number; lon: number };
type SelectedLocation = LatLon & { label: string };

type Props = {
	isOpen: boolean;
	/** Where the location sheet's map starts (the grid map's current center). */
	startLocation: LatLon | null;
	onClose: () => void;
	onSubmitted: () => void;
};

/**
 * Suggests a cruising spot: name, type, description and its place, picked in
 * the same location sheet as a trip's destination. It shows on the map as
 * unconfirmed until people on site confirm it.
 */
export function SuggestCruisingSpotSheet({ isOpen, startLocation, onClose, onSubmitted }: Props) {
	const { t } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const suggest = useSuggestCruisingSpot();
	const [name, setName] = useState("");
	const [category, setCategory] = useState<CruisingSpotCategory | null>(null);
	const [description, setDescription] = useState("");
	const [location, setLocation] = useState<SelectedLocation | null>(null);
	const [isLocationSheetOpen, setIsLocationSheetOpen] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		setName("");
		setCategory(null);
		setDescription("");
		setLocation(null);
	}, [isOpen]);

	const pickLocation = ({ lat, lon }: LatLon) => {
		const fallback = t("browse_location.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) });
		setLocation({ lat, lon, label: t("travel_plans.resolving_location") });
		void reverseGeocodeGeohash(encodeGeohash(lat, lon))
			.catch(() => null)
			.then((label) => {
				// A newer pick replaces this lookup.
				setLocation((current) => (current && current.lat === lat && current.lon === lon ? { lat, lon, label: label ?? fallback } : current));
			});
	};

	const canSubmit = !!location && !!name.trim() && !!category && !suggest.isPending;

	const submit = async () => {
		if (!location || !category || !name.trim()) return;
		try {
			await suggest.mutateAsync({ name: name.trim(), description: description.trim() || null, category, lat: location.lat, lon: location.lon });
			toast.success(t("cruising.suggested_toast"));
			onSubmitted();
		} catch (error) {
			toast.error(cruisingErrorText(error, t));
		}
	};

	return (
		<>
			<ControlledBottomSheet isOpen={isOpen} onDismiss={onClose} isDesktop={isDesktop} isProcessing={suggest.isPending} bg={NATIVE_SHEET_BG} panelClassName="max-h-[92dvh] px-4">
				<div className="mb-3 flex shrink-0 items-center justify-between gap-3">
					<h3 className="text-sm font-semibold text-[var(--text)]">{t("cruising.suggest_title")}</h3>
					<SheetCloseButton disabled={suggest.isPending} />
				</div>
				<div className="-mx-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-3" data-lenis-prevent>
					<p className="px-1 text-sm leading-relaxed text-[var(--text-muted)]">{t("cruising.suggest_hint")}</p>
					<SheetSection title={t("cruising.field_location")}>
						<button
							type="button"
							onClick={() => setIsLocationSheetOpen(true)}
							className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-start transition hover:ink-tint-8 active:scale-[0.99]"
						>
							<span
								className={cn(
									"flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
									location ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "ink-tint-10 text-[var(--text-muted)]",
								)}
							>
								<MapPin weight="fill" className="h-4 w-4" />
							</span>
							<span className={cn("min-w-0 flex-1 truncate text-sm", location ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]")}>
								{location?.label ?? t("cruising.choose_location")}
							</span>
							<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
						</button>
					</SheetSection>
					<SheetSection title={t("cruising.field_name")}>
						<SheetTextInput value={name} onChange={setName} maxLength={CRUISING_NAME_MAX} placeholder={t("cruising.field_name_placeholder")} />
					</SheetSection>
					<SheetSection title={t("cruising.field_category")}>
						<div className="flex flex-wrap gap-2">
							{CRUISING_SPOT_CATEGORIES.map((value) => {
								const Icon = CRUISING_CATEGORY_ICONS[value];
								return (
									<SheetChip key={value} active={category === value} onClick={() => setCategory(value)} size="sm">
										<span className="inline-flex items-center gap-1.5">
											<Icon weight="fill" className="h-3.5 w-3.5" />
											{t(`cruising.categories.${value}`)}
										</span>
									</SheetChip>
								);
							})}
						</div>
					</SheetSection>
					<SheetSection title={t("cruising.field_description")}>
						<textarea
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							maxLength={CRUISING_DESCRIPTION_MAX}
							rows={3}
							placeholder={t("cruising.field_description_placeholder")}
							className={cn(SHEET_FIELD_CLASS, "resize-none px-4 py-3")}
						/>
					</SheetSection>
				</div>
				<div className={SHEET_FOOTER_CLASS}>
					<SheetClose disabled={suggest.isPending} className={sheetButtonClass("secondary")}>
						{t("common.cancel")}
					</SheetClose>
					<button type="button" disabled={!canSubmit} onClick={() => void submit()} className={sheetButtonClass()}>
						{suggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
						<span className="truncate">{t("cruising.submit")}</span>
					</button>
				</div>
			</ControlledBottomSheet>

			{/* Portaled like the suggestion sheet itself (ControlledBottomSheet), and
			    mounted after it, so it stacks on top instead of behind it. */}
			{isLocationSheetOpen &&
				createPortal(
				<TravelDestinationSheet
					initialLocation={location}
					startLocation={startLocation}
					onConfirm={pickLocation}
					onClose={() => setIsLocationSheetOpen(false)}
					isDesktop={isDesktop}
					title={t("cruising.field_location")}
					searchPlaceholder={t("cruising.location_search_placeholder")}
					confirmLabel={t("cruising.use_location")}
					defaultZoom={16}
				/>,
					document.body,
				)}
		</>
	);
}
