import { z } from "zod";

/**
 * `[minLon, minLat, maxLon, maxLat]` — the one bbox shape used by both
 * `ProbabilityGrid` (the raster's coverage area) and `SightingsQuery` (a
 * map-viewport filter). Shared so this refinement (finite numbers,
 * min < max on both axes) only has to be written once.
 *
 * `.finite()` matters specifically: `Number("")` is `0` and
 * `Number("abc")` is `NaN`, both of which a bare `z.number()` accepts
 * (its `typeof` check alone doesn't exclude `NaN`/`Infinity`). Verified
 * live during R2's review: `better-sqlite3` binds a `NaN` parameter as
 * SQL `NULL`, and `x BETWEEN NULL AND y` matches zero rows in SQLite —
 * so an unvalidated malformed bbox doesn't error, it silently returns an
 * empty result indistinguishable from "no sightings here."
 */
export const BboxSchema = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(([minLon, minLat, maxLon, maxLat]) => minLon < maxLon && minLat < maxLat, {
    message: "bbox must have minLon < maxLon and minLat < maxLat",
  });
export type Bbox = z.infer<typeof BboxSchema>;

/**
 * The California coast bbox every Spout query is scoped to — verified
 * live against real data during initial data-source validation (see
 * docs/adr/0002-data-sources.md). The one place this constant is
 * defined; `packages/api`'s GBIF query and `packages/web`'s default map
 * center both derive from it rather than each hardcoding their own copy.
 */
export const CA_COAST_BBOX: Bbox = [-126, 32, -117, 42];
