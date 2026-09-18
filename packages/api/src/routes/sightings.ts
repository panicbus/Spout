import {
  SightingsQuerySchema,
  decodeSightingsQueryParams,
  type SightingsQuery,
} from "@spout/contracts";
import type Database from "better-sqlite3";
import { Hono } from "hono";
import { querySightings } from "../store/sightingsDb.js";
import type { TtlCache } from "../store/ttlCache.js";
import type { SightingsRefreshResult } from "../store/sightingsRefresh.js";
import { sinceDateForWindow } from "../timeWindow.js";

function parseQuery(url: URL): SightingsQuery {
  return SightingsQuerySchema.parse(decodeSightingsQueryParams(url.searchParams));
}

/**
 * `GET /api/sightings` — serves research/citizen/acoustic sightings from
 * `db`, filtered by `bbox`/`species`/`tier`/`window`/`commercialOnly`.
 *
 * Unlike `/api/probability`, a refresh failure here never turns into a
 * 503: the real data lives in `db` (persistent, unlike
 * `ProbabilityCache`'s in-memory-only single value), so a failed GBIF
 * refresh just means this request serves whatever's already in the
 * store — logged, not surfaced as an error to the caller. This holds
 * even past `refreshCache`'s `maxStaleMs` ceiling (see
 * `sightingsRefresh.ts`): once that's exceeded the refresh starts
 * throwing again (instead of silently hammering GBIF on every request
 * forever with nothing logged), and this `catch` still logs it and
 * falls through to the store. Only a malformed query (400), or a truly
 * cold store (never populated, no prior successful refresh) combined
 * with a failing fetch, end this route in something other than a
 * populated 200 — and even the cold-store case returns `200 []`
 * (indistinguishable from a legitimate empty window) rather than an
 * error; see the project memory notes on this known, deliberately
 * deferred gap ahead of R5's deploy.
 */
export function createSightingsRoute(
  db: Database.Database,
  refreshCache: TtlCache<SightingsRefreshResult>,
) {
  return new Hono().get("/api/sightings", async (c) => {
    let query: SightingsQuery;
    try {
      query = parseQuery(new URL(c.req.url));
    } catch {
      return c.json({ error: "invalid query parameters" }, 400);
    }

    try {
      await refreshCache.get();
    } catch (error) {
      console.error("GET /api/sightings: refresh failed, serving from store as-is:", error);
    }

    const sightings = querySightings(db, {
      bbox: query.bbox,
      species: query.species,
      tier: query.tier,
      sinceDate: sinceDateForWindow(query.window),
      commercialOnly: query.commercialOnly,
    });

    return c.json(sightings);
  });
}
