import { fetchEcmmDensity } from "./ecmmDensity.js";
import { fetchSeasonality, type FetchSeasonalityOptions, type SeasonalityResult } from "./gbifSeasonality.js";

/**
 * Composes the GBIF-sighting-based seasonality result (gbifSeasonality.ts)
 * with Duke/NOAA's ECMM habitat density models (ecmmDensity.ts, Phase 4)
 * — each source stays a single-purpose fetcher over its own upstream;
 * this is the one place they're combined. `estimatedDensity` is commonly
 * `undefined` (outside ECMM's Atlantic/Gulf coverage, or gray-whale,
 * which has no Atlantic model at all) — that's real coverage, not a
 * fetch failure, and never blocks the GBIF-based `share`/`sampleSize`
 * figures from being returned.
 *
 * This is `SeasonalityCache`'s default fetcher (see seasonalityCache.ts)
 * — every real `/api/seasonality` response goes through this, not the
 * bare `fetchSeasonality`.
 */
export async function fetchSeasonalityWithDensity(
  lat: number,
  lon: number,
  month: number,
  options: FetchSeasonalityOptions = {},
): Promise<SeasonalityResult> {
  const result = await fetchSeasonality(lat, lon, month, options);
  const species = await Promise.all(
    result.species.map(async (s) => ({
      ...s,
      estimatedDensity: await fetchEcmmDensity(s.species, lat, lon, month, options),
    })),
  );
  return { ...result, species };
}
