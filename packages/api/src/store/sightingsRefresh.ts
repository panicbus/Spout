import type { Sighting } from "@spout/contracts";
import type Database from "better-sqlite3";
import { fetchGbifSightings } from "../sources/gbif.js";
import { dateDaysAgo } from "../timeWindow.js";
import { TtlCache } from "./ttlCache.js";
import { hasSightings, upsertSightings } from "./sightingsDb.js";

/**
 * Wide enough to comfortably cover the longest window the API serves
 * (`12m`, per `timeWindow.ts`) with margin, without ingesting Cascadia's
 * full multi-decade historical corpus (ADR 0002 notes that corpus is
 * dominated by 1990s-2010s records — an all-time backfill would mostly
 * be decades-old survey tracklines, not something any current window
 * needs). Used only on a true cold start (empty store) — see
 * `INCREMENTAL_REFRESH_OVERLAP_DAYS` for every refresh after that.
 */
const BACKFILL_DAYS = 400;

/**
 * Once the store has ever been populated, a refresh only needs to
 * re-fetch a short recent window, not the full `BACKFILL_DAYS` corpus
 * again — `upsertSightings`'s replace-by-id semantics make re-fetching a
 * few extra days of overlap harmless, and this margin exists specifically
 * to catch GBIF records that arrive or get corrected a few days after
 * their observation date. Without this distinction, every refresh costs
 * the same as the initial cold backfill, forever — which directly
 * contradicted this module's own "stays polite to the upstream" framing
 * before this was added (verified: the previous version re-fetched all
 * 400 days on every 6h cycle indefinitely).
 */
const INCREMENTAL_REFRESH_OVERLAP_DAYS = 5;

export interface SightingsRefreshResult {
  count: number;
  refreshedAt: string;
}

export interface CreateSightingsRefreshCacheOptions {
  ttlMs: number;
  maxStaleMs?: number;
  /** Overridable for tests; defaults to the real GBIF-fetching source. */
  fetcher?: (options: { sinceDate: string }) => Promise<Sighting[]>;
}

/**
 * Wraps "fetch from GBIF, upsert into SQLite" as a `TtlCache`'s fetcher —
 * reuses its stale-on-failure and in-flight de-dup for free (a GBIF
 * outage means the next request still gets served from whatever's
 * already in the store, not a 503) instead of hand-rolling refresh
 * bookkeeping again. The cache's own "value" is just a `{count,
 * refreshedAt}` receipt; the actual data consumers want comes from
 * `querySightings` against the db this refresh populates.
 *
 * Callers should set `maxStaleMs` (matching `ProbabilityCache`'s
 * pattern) — without it, a persistent failure is swallowed silently
 * forever once one refresh has ever succeeded, *and* every subsequent
 * request re-attempts a full fetch (since a failed refresh never
 * advances `TtlCache`'s internal `fetchedAt`), hammering GBIF on every
 * single request instead of at most once per TTL window.
 */
export function createSightingsRefreshCache(
  db: Database.Database,
  options: CreateSightingsRefreshCacheOptions,
): TtlCache<SightingsRefreshResult> {
  const fetcher = options.fetcher ?? fetchGbifSightings;

  return new TtlCache({
    ttlMs: options.ttlMs,
    maxStaleMs: options.maxStaleMs,
    fetcher: async () => {
      const sinceDate = hasSightings(db)
        ? dateDaysAgo(INCREMENTAL_REFRESH_OVERLAP_DAYS)
        : dateDaysAgo(BACKFILL_DAYS);
      const sightings = await fetcher({ sinceDate });
      upsertSightings(db, sightings);
      return { count: sightings.length, refreshedAt: new Date().toISOString() };
    },
  });
}
