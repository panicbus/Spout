import { z } from "zod";
import { BboxSchema } from "./bbox.js";
import { SpeciesSchema } from "./species.js";
import { SourceTierSchema } from "./source.js";

/**
 * "latest" replaces the spec's "today"/"this week" (ADR 0003): GBIF has
 * zero records that fresh on a typical day, so those windows are driven
 * by iNaturalist's direct API instead of by this date-range filter.
 */
export const TIME_WINDOWS = ["latest", "30d", "90d", "12m"] as const;
export const TimeWindowSchema = z.enum(TIME_WINDOWS);
export type TimeWindow = z.infer<typeof TimeWindowSchema>;

export const SightingsQuerySchema = z.object({
  bbox: BboxSchema.optional(),
  species: z.array(SpeciesSchema).optional(),
  tier: z.array(SourceTierSchema).optional(),
  window: TimeWindowSchema.default("30d"),
  /** Unused in v1 UI; the query path exists so licensing can be enforced without a re-ingest (ADR 0003). */
  commercialOnly: z.boolean().default(false),
});
export type SightingsQuery = z.infer<typeof SightingsQuerySchema>;
