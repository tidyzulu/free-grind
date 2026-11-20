import { Barbell, Bathtub, Car, FilmSlate, MapPin, Martini, Signpost, Toilet, Tree, TreeEvergreen, Umbrella, VinylRecord, type Icon } from "@phosphor-icons/react";
import type { CruisingSpotCategory } from "../../../../services/api/cruisingMethods";

/** Icon per cruising spot category (Phosphor, used with weight="fill"); unknown ones fall back to a pin. */
export const CRUISING_CATEGORY_ICONS: Record<CruisingSpotCategory, Icon> = {
	park: Tree,
	woods: TreeEvergreen,
	beach: Umbrella,
	restroom: Toilet,
	parking: Car,
	rest_area: Signpost,
	sauna: Bathtub,
	gym: Barbell,
	bar: Martini,
	club: VinylRecord,
	cinema: FilmSlate,
	other: MapPin,
};

export function cruisingCategoryIcon(category: string): Icon {
	return CRUISING_CATEGORY_ICONS[category as CruisingSpotCategory] ?? MapPin;
}
