import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProbabilityGrid, Sighting } from "@spout/contracts";
import type Database from "better-sqlite3";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health.js";
import { createProbabilityRoute } from "./routes/probability.js";
import { createSightingsRoute } from "./routes/sightings.js";
import { fetchLatestProbabilityGrid } from "./sources/whalewatch.js";
import { ProbabilityCache } from "./store/probabilityCache.js";
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

const DEFAULT_SIGHTINGS_DB_PATH = fileURLToPath(new URL("../data/spout.db", import.meta.url));

export interface CreateAppOptions {
  /** Overridable for tests; defaults to the real NOAA-fetching source. */
  probabilityFetcher?: () => Promise<ProbabilityGrid>;
  /** Overridable for tests; defaults to the real GBIF-fetching source. */
  sightingsFetcher?: (options: { sinceDate: string }) => Promise<Sighting[]>;
  /** Overridable for tests (e.g. an in-memory db); defaults to a real file under packages/api/data/. */
  sightingsDb?: Database.Database;
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

  app.route("/", healthRoute);
  app.route("/", createProbabilityRoute(probabilityCache));
  app.route("/", createSightingsRoute(sightingsDb, sightingsRefreshCache));
  return app;
}

function openDefaultSightingsDb(): Database.Database {
  mkdirSync(fileURLToPath(new URL("../data", import.meta.url)), { recursive: true });
  return openSightingsDb(DEFAULT_SIGHTINGS_DB_PATH);
}
