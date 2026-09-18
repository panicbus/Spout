import { z } from "zod";

/**
 * The four species Spout tracks in v1. This is a closed set on purpose:
 * every species-specific UI treatment (seasonality notes, WhaleWatch's
 * blue-whale-only probability model) is keyed off this enum, so adding a
 * fifth species is a deliberate, visible change here, not a silent one at
 * a call site.
 */
export const SPECIES = ["blue-whale", "humpback-whale", "gray-whale", "orca"] as const;

export const SpeciesSchema = z.enum(SPECIES);

export type Species = z.infer<typeof SpeciesSchema>;

export const SPECIES_LABELS: Record<Species, string> = {
  "blue-whale": "Blue Whale",
  "humpback-whale": "Humpback Whale",
  "gray-whale": "Gray Whale",
  orca: "Orca",
};

/**
 * Scientific (Latin binomial) names, shared by every source module that
 * queries an upstream by species — GBIF (R2) and iNaturalist (R3) both
 * key their queries off these, so the mapping lives once here rather
 * than being redefined per source.
 */
export const SPECIES_SCIENTIFIC_NAMES: Record<Species, string> = {
  "blue-whale": "Balaenoptera musculus",
  "humpback-whale": "Megaptera novaeangliae",
  "gray-whale": "Eschrichtius robustus",
  orca: "Orcinus orca",
};

/**
 * Reverses `SPECIES_SCIENTIFIC_NAMES`. GBIF's own `scientificName` field
 * includes an author/year suffix (e.g. "Megaptera novaeangliae (Borowski,
 * 1781)"), so this matches on the binomial prefix rather than requiring
 * an exact string match.
 */
export function speciesFromScientificName(scientificName: string): Species | undefined {
  return SPECIES.find((species) =>
    scientificName.startsWith(SPECIES_SCIENTIFIC_NAMES[species]),
  );
}
