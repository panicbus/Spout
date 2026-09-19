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

/**
 * The one place a `TimeWindow` maps to a day count. `packages/api`'s
 * `timeWindow.ts` uses this for the `sinceDate` query cutoff;
 * `packages/web`'s `ageBucket.ts` uses `latest`/`30d`'s values for its
 * visual age-fade boundaries, so a pin's fade actually corresponds to the
 * filter windows a user can select rather than an independently-chosen
 * literal that could silently drift from them.
 */
export const TIME_WINDOW_DAYS: Record<TimeWindow, number> = {
  latest: 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

export const SightingsQuerySchema = z.object({
  bbox: BboxSchema.optional(),
  species: z.array(SpeciesSchema).optional(),
  tier: z.array(SourceTierSchema).optional(),
  window: TimeWindowSchema.default("30d"),
  /** Unused in v1 UI; the query path exists so licensing can be enforced without a re-ingest (ADR 0003). */
  commercialOnly: z.boolean().default(false),
});
export type SightingsQuery = z.infer<typeof SightingsQuerySchema>;
