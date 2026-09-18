import { Hono } from "hono";
import type { ProbabilityCache } from "../store/probabilityCache.js";

/**
 * `GET /api/probability` — serves the current WhaleWatch 2.0 grid from
 * `cache`. Takes the cache as a parameter (built once in `app.ts` from
 * the real `fetchLatestProbabilityGrid`, or from a test double) rather
 * than constructing one itself, so this route has no network dependency
 * of its own to mock around in tests.
 */
export function createProbabilityRoute(cache: ProbabilityCache) {
  return new Hono().get("/api/probability", async (c) => {
    try {
      const grid = await cache.get();
      return c.json(grid);
    } catch (error) {
      // A decode bug or a schema mismatch from an upstream format change
      // looks identical to "NOAA is briefly down" to the caller (both
      // land here) — logging the real error is the only way to tell
      // them apart later, especially once ProbabilityCache's
      // stale-on-failure fallback means a persistent bug can keep
      // serving old data with no visible symptom otherwise.
      console.error("GET /api/probability failed:", error);
      return c.json(
        { error: "WhaleWatch 2.0 probability data is currently unavailable" },
        503,
      );
    }
  });
}
