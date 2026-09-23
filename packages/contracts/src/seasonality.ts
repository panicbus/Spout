import { z } from "zod";
import { SpeciesSchema } from "./species.js";

/**
 * Query params arrive as strings (a real `URLSearchParams`), so numeric
 * fields go through `z.coerce` — matching this project's other
 * query-schema convention (see `filters.ts`'s `SightingsQuerySchema`
 * handling of `bbox`), rather than requiring the route handler to parse
 * strings itself before validating.
 */
export const SeasonalityQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  /** YYYY-MM-DD — only the month is actually used (see gbifSeasonality.ts), but the full date is required so a future day-of-year refinement doesn't need a breaking query-shape change. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Defaults to 50km — wide enough to cover a real bay/headland without pulling in an unrelated stretch of coast. */
  radiusKm: z.coerce.number().positive().default(50),
});
export type SeasonalityQuery = z.infer<typeof SeasonalityQuerySchema>;

const SpeciesSeasonalitySchema = z.object({
  species: SpeciesSchema,
  /**
   * Effort-normalized share of all-cetacean reports in this window that
   * were this species (0-1) — NOT an absolute sighting probability. See
   * ADR 0006. Omitted (never fabricated as 0) below the sample-size
   * honesty threshold.
   */
  share: z.number().min(0).max(1).optional(),
  /** How many all-cetacean reports the share was computed from — the same number the suppression threshold is judged against, surfaced so the UI can show its work rather than asserting confidence silently. */
  sampleSize: z.number().int().nonnegative(),
  /**
   * Duke/NOAA ECMM habitat-model density, in animals per 100 km² (Phase
   * 4) — an independent, model-based figure shown alongside `share`,
   * never blended into it. Only defined for the 3 tracked species with
   * an Atlantic model (gray-whale has none — a real Pacific/Arctic
   * migrant, not a gap) and only within the model's U.S. Atlantic/Gulf
   * coverage; commonly omitted everywhere else, same honesty rule as
   * `share`: never fabricated when there's nothing to report.
   */
  estimatedDensity: z.number().nonnegative().optional(),
});

export const SeasonalityResponseSchema = z.object({
  month: z.number().int().min(1).max(12),
  species: z.array(SpeciesSeasonalitySchema),
});
export type SeasonalityResponse = z.infer<typeof SeasonalityResponseSchema>;

/** Same lat/lon/radius as `SeasonalityQuerySchema`, minus `date` — a year view has no "today," it answers for the whole calendar at once. */
export const SeasonalityYearQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().default(50),
});
export type SeasonalityYearQuery = z.infer<typeof SeasonalityYearQuerySchema>;

/** One month's share/sampleSize — the same honesty rule as `SpeciesSeasonalitySchema.share` above, applied independently per month: a well-sampled July next to an unsampled February is real seasonality, not a bug. */
const MonthShareSchema = z.object({
  month: z.number().int().min(1).max(12),
  share: z.number().min(0).max(1).optional(),
  sampleSize: z.number().int().nonnegative(),
});

const SpeciesSeasonalityYearSchema = z.object({
  species: SpeciesSchema,
  /** Always 12 entries, months 1-12, one per calendar month. */
  months: z.array(MonthShareSchema),
});

export const SeasonalityYearResponseSchema = z.object({
  species: z.array(SpeciesSeasonalityYearSchema),
});
export type SeasonalityYearResponse = z.infer<typeof SeasonalityYearResponseSchema>;
