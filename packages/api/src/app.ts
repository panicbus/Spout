import type { ProbabilityGrid } from "@spout/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health.js";
import { createProbabilityRoute } from "./routes/probability.js";
import { fetchLatestProbabilityGrid } from "./sources/whalewatch.js";
import { ProbabilityCache } from "./store/probabilityCache.js";

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

export interface CreateAppOptions {
  /** Overridable for tests; defaults to the real NOAA-fetching source. */
  probabilityFetcher?: () => Promise<ProbabilityGrid>;
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

  app.route("/", healthRoute);
  app.route("/", createProbabilityRoute(probabilityCache));
  return app;
}
