import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProbabilityGrid, Sighting } from "@spout/contracts";
import type Database from "better-sqlite3";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health.js";
import { createProbabilityRoute } from "./routes/probability.js";
import { createSeasonalityRoute } from "./routes/seasonality.js";
import { createSightingsRoute } from "./routes/sightings.js";
import { fetchGbifSightings } from "./sources/gbif.js";
import type { SeasonalityFetcher } from "./sources/gbifSeasonality.js";
import { fetchLatestProbabilityGrid } from "./sources/whalewatch.js";
import { GlobalSightingsCache } from "./store/globalSightingsCache.js";
import { createINaturalistRefreshCache } from "./store/inaturalistRefresh.js";
import { ProbabilityCache } from "./store/probabilityCache.js";
import { SeasonalityCache } from "./store/seasonalityCache.js";
import { openSightingsDb } from "./store/sightingsDb.js";
import { createSightingsRefreshCache } from "./store/sightingsRefresh.js";

/** WhaleWatch 2.0 refreshes roughly daily with a multi-day lag — checking every 6h is ample and polite to the upstream. */
const PROBABILITY_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
/**
 * If NOAA can't be reached for a full week straight, something is
 * genuinely broken (not just the model's normal ~3-day lag) — past this
 * point `ProbabilityCache` throws instead of continuing to serve
 * increasingly stale data as if it were current. See ADR 0002's honesty
 * requirement and `TtlCache`'s own doc comment.
 */
const PROBABILITY_CACHE_MAX_STALE_MS = 1000 * 60 * 60 * 24 * 7;
/** GBIF's own aggregation lags days-to-weeks; a 6h refresh cadence is more than enough and stays polite to the upstream. */
const SIGHTINGS_REFRESH_TTL_MS = 1000 * 60 * 60 * 6;
/**
 * Matches `PROBABILITY_CACHE_MAX_STALE_MS`'s reasoning: past a week of
 * persistent refresh failures, `/api/sightings` should surface that as a
 * real, loud error (still served from whatever's in the store — see
 * `routes/sightings.ts` — but visible in logs) rather than silently
 * re-attempting a full fetch on every single request forever with no
 * ceiling.
 */
const SIGHTINGS_REFRESH_MAX_STALE_MS = 1000 * 60 * 60 * 24 * 7;
/** iNaturalist has real new data multiple times a day (unlike GBIF's weeks-long lag) — a 1h cadence keeps "latest" genuinely fresh without hammering the upstream. */
const INATURALIST_REFRESH_TTL_MS = 1000 * 60 * 60;
/** Same reasoning as SIGHTINGS_REFRESH_MAX_STALE_MS, applied to the faster-refreshing iNaturalist cache. */
const INATURALIST_REFRESH_MAX_STALE_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Overridable via `SIGHTINGS_DB_PATH` so a deploy can point this at a
 * mounted persistent disk (e.g. Render's) instead of the package's own
 * `data/` directory, which lives on ephemeral container storage in
 * production — without an override, every redeploy/restart would silently
 * start from an empty database, re-triggering the cold-start ~400-day
 * backfill (ADR 0004) and reproducing the "200 []" ambiguous-empty-window
 * behavior on every restart instead of just once, ever.
 */
const DEFAULT_SIGHTINGS_DB_PATH = fileURLToPath(new URL("../data/spout.db", import.meta.url));

export interface CreateAppOptions {
  /** Overridable for tests; defaults to the real NOAA-fetching source. */
  probabilityFetcher?: () => Promise<ProbabilityGrid>;
  /** Overridable for tests; defaults to the real GBIF-fetching source. */
  sightingsFetcher?: (options: { sinceDate: string }) => Promise<Sighting[]>;
  /** Overridable for tests; defaults to the real iNaturalist-fetching source. */
  inaturalistFetcher?: (options: { sinceDate: string }) => Promise<Sighting[]>;
  /** Overridable for tests (e.g. an in-memory db); defaults to a real file under packages/api/data/. */
  sightingsDb?: Database.Database;
  /** Overridable for tests; defaults to the real fetchSeasonalityWithDensity (GBIF share + ECMM density enrichment). */
  seasonalityFetcher?: SeasonalityFetcher;
  /** Overridable for tests; defaults to the real GBIF-fetching fetchGbifSightings (Phase 2's on-demand global path). */
  globalSightingsFetcher?: typeof fetchGbifSightings;
}

/**
 * Builds the Hono app without binding it to a port. Kept separate from
 * `server.ts` so tests call routes in-process via `app.request()` —
 * no socket, no port collisions, no server lifecycle to manage in tests.
 */
export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono();
  // Every route this API serves is public, read-only, keyless whale data
  // (see docs/spec.md) — there's no session/cookie to protect, so an
  // open CORS policy is the correct one, not just the convenient one.
  app.use("*", cors());

  const probabilityCache = new ProbabilityCache({
    ttlMs: PROBABILITY_CACHE_TTL_MS,
    maxStaleMs: PROBABILITY_CACHE_MAX_STALE_MS,
    fetcher: options.probabilityFetcher ?? fetchLatestProbabilityGrid,
  });

  const sightingsDb = options.sightingsDb ?? openDefaultSightingsDb();
  const sightingsRefreshCache = createSightingsRefreshCache(sightingsDb, {
    ttlMs: SIGHTINGS_REFRESH_TTL_MS,
    maxStaleMs: SIGHTINGS_REFRESH_MAX_STALE_MS,
    fetcher: options.sightingsFetcher,
  });
  const inaturalistRefreshCache = createINaturalistRefreshCache(sightingsDb, {
    ttlMs: INATURALIST_REFRESH_TTL_MS,
    maxStaleMs: INATURALIST_REFRESH_MAX_STALE_MS,
    fetcher: options.inaturalistFetcher,
  });

  const seasonalityCache = new SeasonalityCache({ fetcher: options.seasonalityFetcher });

  app.route("/", healthRoute);
  app.route("/", createProbabilityRoute(probabilityCache));
  app.route("/", createSeasonalityRoute(seasonalityCache));
  app.route(
    "/",
    createSightingsRoute(
      sightingsDb,
      [
        { name: "GBIF", cache: sightingsRefreshCache },
        // Runs second deliberately — see createSightingsRoute's doc
        // comment: whichever refresh's write lands last wins the
        // converged-id upsert race, and iNaturalist-direct's fields are
        // the more authoritative copy for any observation both sources see.
        { name: "iNaturalist", cache: inaturalistRefreshCache },
      ],
      new GlobalSightingsCache(options.globalSightingsFetcher),
    ),
  );
  return app;
}

function openDefaultSightingsDb(): Database.Database {
  const dbPath = process.env.SIGHTINGS_DB_PATH ?? DEFAULT_SIGHTINGS_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });
  return openSightingsDb(dbPath);
}
