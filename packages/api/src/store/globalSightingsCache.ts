import { CA_COAST_BBOX, type Bbox, type Sighting, type TimeWindow } from "@spout/contracts";
import { fetchGbifSightings, type FetchGbifSightingsOptions } from "../sources/gbif.js";
import { sinceDateForWindow } from "../timeWindow.js";
import { TtlCache } from "./ttlCache.js";

/**
 * Matches the CA refresh cadence (`sightingsRefresh.ts`) — GBIF's own
 * aggregation lags days-to-weeks regardless of region, so there's no
 * reason for the on-demand global path to poll more eagerly than the
 * persistent one does.
 */
const GLOBAL_SIGHTINGS_TTL_MS = 1000 * 60 * 60 * 6;

/**
 * True when `bbox` sits fully inside `CA_COAST_BBOX`. The persistent,
 * iNaturalist-freshness-layered store (`sightingsDb.ts`) already covers
 * this region — a request whose bbox stays within it should keep using
 * that store, not duplicate live GBIF calls for the same area the
 * refresh pipeline already maintains.
 */
export function isWithinCaCoastBbox(bbox: Bbox): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const [caMinLon, caMinLat, caMaxLon, caMaxLat] = CA_COAST_BBOX;
  return minLon >= caMinLon && maxLon <= caMaxLon && minLat >= caMinLat && maxLat <= caMaxLat;
}

function cacheKey(bbox: Bbox, window: TimeWindow): string {
  return `${bbox.map((n) => n.toFixed(2)).join(",")}|${window}`;
}

/**
 * The Phase 2 "global scope" answer to the fixed-region SQLite mirror:
 * rather than trying to backfill the whole world into a persistent
 * store (GBIF's 100,001-offset cap makes that genuinely infeasible for
 * a popular species at global volume — humpback alone is ~350k records
 * over the last decade), sightings for anywhere outside California are
 * computed on demand and cached per `(bbox, window)` cell, mirroring
 * `SeasonalityCache`'s same pattern for the same underlying reason.
 *
 * Same accepted limitation as `SeasonalityCache`: this map only grows,
 * no eviction. Real map panning clusters on real coastline, so this
 * isn't expected to matter in practice.
 */
export class GlobalSightingsCache {
  private caches = new Map<string, TtlCache<Sighting[]>>();

  constructor(private readonly fetcher: (options: FetchGbifSightingsOptions) => Promise<Sighting[]> = fetchGbifSightings) {}

  get(bbox: Bbox, window: TimeWindow): Promise<Sighting[]> {
    const key = cacheKey(bbox, window);
    let cache = this.caches.get(key);
    if (!cache) {
      cache = new TtlCache<Sighting[]>({
        ttlMs: GLOBAL_SIGHTINGS_TTL_MS,
        fetcher: () => this.fetcher({ sinceDate: sinceDateForWindow(window), bbox }),
      });
      this.caches.set(key, cache);
    }
    return cache.get();
  }
}
