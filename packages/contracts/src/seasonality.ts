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
});

export const SeasonalityResponseSchema = z.object({
  month: z.number().int().min(1).max(12),
  species: z.array(SpeciesSeasonalitySchema),
});
export type SeasonalityResponse = z.infer<typeof SeasonalityResponseSchema>;
