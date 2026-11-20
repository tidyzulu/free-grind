import { useTranslation } from "react-i18next";
import { ToggleRow } from "../../../../components/ui/toggle-row";
import { SHEET_GROUP_CLASS, SheetSection } from "../../../../components/ui/sheet-section";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { useCruisingSpotsEnabled } from "../../../../hooks/queries/useCruisingQueries";

/**
 * Filter sheets (grid, Right Now): shows or hides the cruising spots on the
 * maps. A display setting, applied at once (not part of the filter draft).
 * Renders nothing where the server has no cruising spots.
 */
export function CruisingLayerToggle({ accentColor }: { accentColor?: string }) {
	const { t } = useTranslation();
	const isEnabled = useCruisingSpotsEnabled();
	const { showCruisingSpots, setPreferences } = usePreferences();
	if (!isEnabled) return null;
	return (
		<SheetSection title={t("cruising.layer_section")}>
			<div className={SHEET_GROUP_CLASS}>
				<ToggleRow
					checked={showCruisingSpots}
					onChange={(checked) => void setPreferences({ showCruisingSpots: checked })}
					label={t("cruising.layer_toggle")}
					description={t("cruising.layer_toggle_hint")}
					activeColor={accentColor}
					padding="px-4 py-3"
				/>
			</div>
		</SheetSection>
	);
}
