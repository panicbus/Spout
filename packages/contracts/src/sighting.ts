import { z } from "zod";
import { SpeciesSchema } from "./species.js";
import { AttributionSchema, SourceApiSchema, SourceTierSchema } from "./source.js";

const isoDateTimeString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "must be a parseable ISO 8601 date/time string",
});

/**
 * iNaturalist's `quality_grade` has three values, not two: `research`,
 * `needs_id`, and `casual` (casual records lack a wild/verifiable location
 * or evidence — e.g. captive animals, no photo). Decision: `research` maps
 * to `verified`, `needs_id` maps to `unverified`, and `casual` records are
 * dropped entirely during normalization — they never become a `Sighting`
 * at all, so this schema only needs the two states that survive ingestion.
 */
export const VerificationStatusSchema = z.enum(["verified", "unverified"]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * The one normalized shape every upstream record is converted into.
 * Both `packages/api` and `packages/web` import this — a schema change
 * here breaks both builds instead of drifting silently at runtime.
 */
export const SightingSchema = z.object({
  /** Spout-internal id, namespaced by source: `${sourceApi}:${upstreamId}`. */
  id: z.string().min(1),
  species: SpeciesSchema,
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  observedAt: isoDateTimeString,
  tier: SourceTierSchema,
  sourceApi: SourceApiSchema,
  verification: VerificationStatusSchema,
  /** True when the upstream source (iNaturalist geoprivacy) randomized this coordinate. */
  coordinatesObscured: z.boolean(),
  /**
   * Radius in meters, when the upstream source reports one — e.g. GBIF's
   * `coordinateUncertaintyInMeters`. Distinct from `coordinatesObscured`:
   * that's iNaturalist's binary "this point was deliberately randomized"
   * flag, this is a continuous precision estimate. A future detail card
   * needs both to avoid rendering a ±50m research trackline point and a
   * ±5km vague report as visually identical pins.
   */
  positionalUncertaintyMeters: z.number().nonnegative().optional(),
  attribution: AttributionSchema,
});
export type Sighting = z.infer<typeof SightingSchema>;
