import type { SightingsQuery } from "./filters.js";

/**
 * The one encode/decode pair for `SightingsQuery` as a URL query string —
 * `packages/api`'s `/api/sightings` route and `packages/web`'s
 * `apiClient.fetchSightings` used to maintain hand-written inverses of
 * this independently, with no compiler check that they actually agreed
 * (`commercialOnly` was serialized via `String(bool)` on one side and
 * parsed via `=== "true"` on the other — correct today only by
 * convention). One codec here, imported by both, means a future field
 * changes in one place instead of three (schema + two codecs).
 */

/** Encodes `params` into a query string (including the leading `?`, or `""` if nothing was set). Only includes keys the caller actually set — the API applies `SightingsQuerySchema`'s own defaults for anything omitted. */
export function encodeSightingsQuery(params: Partial<SightingsQuery>): string {
  const search = new URLSearchParams();

  if (params.bbox) search.set("bbox", params.bbox.join(","));
  if (params.species && params.species.length > 0) search.set("species", params.species.join(","));
  if (params.tier && params.tier.length > 0) search.set("tier", params.tier.join(","));
  if (params.window) search.set("window", params.window);
  if (params.commercialOnly !== undefined) search.set("commercialOnly", String(params.commercialOnly));

  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * Decodes `searchParams` into the raw shape `SightingsQuerySchema.parse`
 * expects. Does not itself call `.parse()` — callers decide how to
 * surface a validation failure (the API route returns 400; a future web
 * caller might handle it differently) — but DOES throw directly for
 * `commercialOnly`, since an unrecognized value there is a case the
 * schema's plain `boolean` type can't catch on its own (silently
 * defaulting an unrecognized string to `false` would quietly disable the
 * one filter that exists specifically to enforce licensing).
 *
 * An empty bbox segment (e.g. a trailing comma, `"-126,32,-117,"`)
 * becomes `NaN`, not `Number("")`'s `0` — `BboxSchema`'s `.finite()`
 * check then rejects it, rather than silently querying a wrong-but-valid
 * bbox with one edge implicitly at 0.
 */
export function decodeSightingsQueryParams(searchParams: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};

  const bbox = searchParams.get("bbox");
  if (bbox) {
    raw.bbox = bbox.split(",").map((part) => (part.trim() === "" ? NaN : Number(part)));
  }

  const species = searchParams.get("species");
  if (species) raw.species = species.split(",");

  const tier = searchParams.get("tier");
  if (tier) raw.tier = tier.split(",");

  const window = searchParams.get("window");
  if (window) raw.window = window;

  const commercialOnly = searchParams.get("commercialOnly");
  if (commercialOnly !== null) {
    if (commercialOnly !== "true" && commercialOnly !== "false") {
      throw new Error(`invalid commercialOnly value: "${commercialOnly}"`);
    }
    raw.commercialOnly = commercialOnly === "true";
  }

  return raw;
}
