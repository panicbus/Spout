import { fetchSeasonality, type SeasonalityResult } from "../sources/gbifSeasonality.js";
import { TtlCache } from "./ttlCache.js";

/** Historical data, computed from an 11-year pool (gbifSeasonality.ts) — it does not go stale from day to day, so a long TTL is correct, not just tolerable. */
const SEASONALITY_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** Rounds to ~11km cells so nearby taps within the same cell share one cached query instead of each burning a fresh pair of GBIF calls. */
function cacheKey(lat: number, lon: number, month: number): string {
  const roundedLat = Math.round(lat * 10) / 10;
  const roundedLon = Math.round(lon * 10) / 10;
  return `${roundedLat},${roundedLon},${month}`;
}

/**
 * A `TtlCache` per `(lat, lon, month)` cell, created lazily — unlike
 * `ProbabilityCache`/the sightings refresh caches, there's no one fixed
 * key to cache under here, since a request can name any point on Earth.
 * Each cell still gets `TtlCache`'s real behavior (in-flight
 * de-duplication in particular matters here: a popular spot could
 * plausibly get several concurrent taps for the same cell).
 *
 * Known, accepted limitation: this map only ever grows — no eviction.
 * Real taps cluster on real coastline/whale-watching locations, and the
 * per-entry cost is tiny (a few numbers), so this isn't expected to
 * matter in practice; revisit with an LRU cap if it ever does.
 */
export interface SeasonalityCacheOptions {
  /** Overridable for tests; defaults to the real GBIF-fetching fetchSeasonality. */
  fetcher?: typeof fetchSeasonality;
}

export class SeasonalityCache {
  private caches = new Map<string, TtlCache<SeasonalityResult>>();
  private readonly fetcher: typeof fetchSeasonality;

  constructor({ fetcher = fetchSeasonality }: SeasonalityCacheOptions = {}) {
    this.fetcher = fetcher;
  }

  get(lat: number, lon: number, month: number, radiusKm?: number): Promise<SeasonalityResult> {
    const key = cacheKey(lat, lon, month);
    let cache = this.caches.get(key);
    if (!cache) {
      cache = new TtlCache<SeasonalityResult>({
        ttlMs: SEASONALITY_TTL_MS,
        fetcher: () => this.fetcher(lat, lon, month, { radiusKm }),
      });
      this.caches.set(key, cache);
    }
    return cache.get();
  }
}
