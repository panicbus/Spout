import type { Species } from "@spout/contracts";

/**
 * Per-species seasonality caveats — deliberately a partial map, not one
 * entry per `SPECIES`: most of this project's species don't need one, and
 * a species with no real seasonal-absence pattern shouldn't get an
 * invented note just to fill the table. Only add an entry here backed by
 * real, verified migration/distribution evidence, not a guess — ADR 0002
 * itself asserts the seasonal-absence fact but cites no source or exact
 * months, so the window below is verified separately against NOAA
 * Fisheries' gray whale migration-timing page
 * (fisheries.noaa.gov/west-coast/science-data/gray-whales-eastern-north-pacific):
 * southbound past California roughly Nov–Feb (peak Dec–Jan), northbound
 * roughly Feb–May (peak Mar–Apr) — i.e. present November through May, not
 * summer/fall, when the population is on its Arctic feeding grounds.
 */
const SEASONALITY_NOTES: Partial<Record<Species, string>> = {
  "gray-whale": "Gray whales migrate through California waters and are typically present November through May — an empty map outside this window reflects migration timing, not missing data.",
};

/**
 * The seasonality caveat for `species`, or `undefined` if none is
 * documented. Surfaced in `PinDetailCard` so a thin or empty result for a
 * migratory species reads as biology, not a broken app (ADR 0002).
 */
export function seasonalityNote(species: Species): string | undefined {
  return SEASONALITY_NOTES[species];
}
