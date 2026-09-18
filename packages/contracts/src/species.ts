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
