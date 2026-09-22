import { SeasonalityQuerySchema, type SeasonalityQuery } from "@spout/contracts";
import { Hono } from "hono";
import type { SeasonalityCache } from "../store/seasonalityCache.js";

function parseQuery(url: URL): SeasonalityQuery {
  return SeasonalityQuerySchema.parse(Object.fromEntries(url.searchParams));
}

/** The calendar month (1-12) of a YYYY-MM-DD date string — parsed from the string directly, not via `new Date(date).getUTCMonth()`, so this never depends on the server's own local timezone. */
function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

/**
 * `GET /api/seasonality?lat=&lon=&date=&radiusKm=` — see ADR 0006 for why
 * this reports an effort-normalized *share* of reported sightings, not
 * an absolute probability, and why that's computed on demand per
 * location rather than from a global backfill.
 */
export function createSeasonalityRoute(cache: SeasonalityCache) {
  return new Hono().get("/api/seasonality", async (c) => {
    let query: SeasonalityQuery;
    try {
      query = parseQuery(new URL(c.req.url));
    } catch {
      return c.json({ error: "invalid query parameters" }, 400);
    }

    try {
      const result = await cache.get(query.lat, query.lon, monthOf(query.date), query.radiusKm);
      return c.json(result);
    } catch (error) {
      console.error("GET /api/seasonality failed:", error);
      return c.json({ error: "seasonality data is currently unavailable" }, 503);
    }
  });
}
