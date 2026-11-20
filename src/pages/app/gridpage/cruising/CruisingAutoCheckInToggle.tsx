import { SignIn } from "@phosphor-icons/react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { SELECT_SHEET_SECTION_LABEL_CLASS } from "../../../../components/ui/select-sheet";
import { ToggleRow } from "../../../../components/ui/toggle-row";
import { useCruisingPrefs, useCruisingSpotsEnabled, useSetCruisingAutoCheckIn } from "../../../../hooks/queries/useCruisingQueries";
import { cruisingErrorText } from "./CruisingSpotSheet";

/**
 * Location preferences sheet: a "Cruising" section with "check in
 * automatically" at cruising spots, styled like the map rows above it
 * (MapVisibilityControls, variant "sheet"). Free Grind server, flag
 * `cruising-spots`; renders nothing without it.
 */
export function CruisingAutoCheckInSection() {
	const { t } = useTranslation();
	const isEnabled = useCruisingSpotsEnabled();
	const { data } = useCruisingPrefs(isEnabled);
	const setAutoCheckIn = useSetCruisingAutoCheckIn();
	if (!isEnabled || !data) return null;
	return (
		<div className="pt-3">
			<p className={SELECT_SHEET_SECTION_LABEL_CLASS}>{t("cruising.preferences_section")}</p>
			<div className="overflow-hidden rounded-2xl">
				<ToggleRow
					icon={<SignIn weight="fill" className="h-5 w-5" />}
					iconClass="bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
					label={t("cruising.auto_check_in")}
					description={t("cruising.auto_check_in_hint", { minutes: data.autoCheckInMinutes })}
					checked={data.autoCheckIn}
					onChange={(checked) => setAutoCheckIn.mutate(checked, { onError: (error) => toast.error(cruisingErrorText(error, t)) })}
					padding="px-3 py-3"
				/>
			</div>
		</div>
	);
}
