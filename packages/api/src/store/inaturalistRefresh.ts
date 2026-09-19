import type { Sighting } from "@spout/contracts";
import type Database from "better-sqlite3";
import { fetchINaturalistSightings } from "../sources/inaturalist.js";
import { dateDaysAgo } from "../timeWindow.js";
import { TtlCache } from "./ttlCache.js";
import { upsertSightings } from "./sightingsDb.js";
import type { SightingsRefreshResult } from "./sightingsRefresh.js";

/**
 * Wide enough to cover the `30d` window with margin, without the
 * cold-start/incremental distinction `sightingsRefresh.ts` (GBIF) needs:
 * iNaturalist direct exists purely for freshness (ADR 0002 — GBIF's own
 * aggregation lags weeks), not historical depth, so every refresh
 * fetching the same fixed ~35-day window is correct, not wasteful — the
 * "steady-state cost must shrink" problem GBIF had doesn't apply here
 * because this window was never meant to grow.
 */
const WINDOW_DAYS = 35;

export interface CreateINaturalistRefreshCacheOptions {
  ttlMs: number;
  maxStaleMs?: number;
  /** Overridable for tests; defaults to the real iNaturalist-fetching source. */
  fetcher?: (options: { sinceDate: string }) => Promise<Sighting[]>;
}

/**
 * Same shape as `createSightingsRefreshCache` (fetch, upsert into the
 * same `sightings` table, `TtlCache`-wrapped for stale-on-failure +
 * in-flight de-dup) but deliberately a separate function, not a shared
 * parameter on that one: the two sources' refresh semantics genuinely
 * differ (GBIF needs backfill-vs-incremental; this doesn't), and forcing
 * a shared abstraction over that difference would be the wrong kind of
 * DRY. A much shorter TTL than GBIF's (see `app.ts`) keeps `"latest"`
 * genuinely fresh.
 */
export function createINaturalistRefreshCache(
  db: Database.Database,
  options: CreateINaturalistRefreshCacheOptions,
): TtlCache<SightingsRefreshResult> {
  const fetcher = options.fetcher ?? fetchINaturalistSightings;

  return new TtlCache({
    ttlMs: options.ttlMs,
    maxStaleMs: options.maxStaleMs,
    fetcher: async () => {
      const sightings = await fetcher({ sinceDate: dateDaysAgo(WINDOW_DAYS) });
      upsertSightings(db, sightings);
      return { count: sightings.length, refreshedAt: new Date().toISOString() };
    },
  });
}
