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
 * `ProbabilityCache`'s in-memory-only single value), so a failed refresh
 * just means this request serves whatever's already in the store —
 * logged, not surfaced as an error to the caller. This holds even past
 * a refresh cache's `maxStaleMs` ceiling (see `sightingsRefresh.ts`):
 * once that's exceeded the refresh starts throwing again (instead of
 * silently hammering the upstream on every request forever with nothing
 * logged), and this still logs it and falls through to the store. Only
 * a malformed query (400), or a truly cold store (never populated, no
 * prior successful refresh) combined with a failing fetch, end this
 * route in something other than a populated 200 — and even the
 * cold-store case returns `200 []` (indistinguishable from a legitimate
 * empty window) rather than an error; see the project memory notes on
 * this known, deliberately deferred gap ahead of R5's deploy.
 *
 * Awaits BOTH the GBIF and iNaturalist refresh caches — in order, not
 * concurrently — before querying the store, since the store this route
 * reads from is fed by both. Order matters: for an observation both
 * paths can independently write (R3's GBIF-dataset/direct-API de-dup
 * convergence onto the same `inaturalist:<id>`), `upsertSightings` is a
 * blind `INSERT OR REPLACE` with no field-level merge, so whichever
 * write lands last wins outright. Running GBIF's cache first and
 * iNaturalist-direct's second means the more authoritative copy (ground-
 * truth `coordinatesObscured`, a real per-observation `attributionUrl` —
 * see `normalize/inaturalist.ts`) always wins that race, not whichever
 * upstream happened to answer faster. Each is still independently
 * try/caught so one failing doesn't block the other from having a
 * chance to succeed.
 */
export function createSightingsRoute(
  db: Database.Database,
  refreshCaches: { name: string; cache: TtlCache<SightingsRefreshResult> }[],
) {
  return new Hono().get("/api/sightings", async (c) => {
    let query: SightingsQuery;
    try {
      query = parseQuery(new URL(c.req.url));
    } catch {
      return c.json({ error: "invalid query parameters" }, 400);
    }

    for (const { name, cache } of refreshCaches) {
      try {
        await cache.get();
      } catch (reason) {
        console.error(`GET /api/sightings: the ${name} refresh failed, serving from store as-is:`, reason);
      }
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
