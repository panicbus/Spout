import { readFileSync } from "node:fs";
import { bboxClip } from "@turf/bbox-clip";
import { feature } from "topojson-client";
import type { Bbox, LandMask } from "@spout/contracts";
import { rasterizeLandMask, type PolygonFeature } from "./landMask.js";

/**
 * How much finer than the probability grid's own resolution the mask is
 * computed at — see `rasterizeLandMask`'s doc comment for why this needs
 * to be well above 1. 6x was measured against the real WhaleWatch grid
 * shape: ~16ms to rasterize, but loading+clipping the real coastline data
 * (`loadClippedLandFeatures`, dominated by parsing the 2.9MB
 * `world-atlas` JSON file) measured 70-110ms, not the ~30ms an earlier
 * estimate assumed — call it ~100-130ms total, cold. Both steps are
 * synchronous (`readFileSync`+`JSON.parse`, then the scanline loop), so
 * this genuinely blocks Node's single-threaded event loop for that
 * window — unlike this codebase's other slow-first-request paths (the
 * NOAA raster fetch), which are async I/O and don't block anything else
 * while waiting. Still an acceptable one-time cost: `getLandMask` below
 * memoizes for the life of the process, so it's paid once per deploy, on
 * whichever request happens to trigger the first grid fetch — not once
 * per request, and not once per 6h refresh cycle.
 */
const SUPERSAMPLE_FACTOR = 6;

let cache: { key: string; landMask: LandMask } | undefined;

/**
 * Loads Natural Earth's land polygon (via the `world-atlas` npm package —
 * a local file read, no network call) and clips it to `bbox`, so the
 * scanline rasterizer only has to consider the handful of coastline
 * vertices actually near California, not the whole world's.
 *
 * `world-atlas`'s `land` object is a single feature (the whole world's
 * land as one `MultiPolygon`), so there's only ever one element to clip
 * here — the real per-region filtering happens inside `bboxClip` itself
 * (and, more finely, inside `rasterizeLandMask`'s edge extraction, which
 * only pays for edges a given scanline can actually cross). An earlier
 * version of this function also `.filter()`ed the clipped result by
 * `coordinates.length > 0`, believing that dropped fully-outside-bbox
 * polygon parts — verified live that it didn't: `bboxClip` preserves the
 * outer array's length (4061 parts for the real world dataset) and empties
 * out-of-bbox parts *in place* rather than removing them, so that length
 * check was always true and the filter never removed anything.
 */
export function loadClippedLandFeatures(bbox: Bbox): PolygonFeature[] {
  const topoUrl = new URL(import.meta.resolve("world-atlas/land-10m.json"));
  const topology = JSON.parse(readFileSync(topoUrl, "utf-8")) as Parameters<typeof feature>[0];
  const land = feature(topology, topology.objects.land!) as unknown as { features: PolygonFeature[] };

  return land.features.map((f) => bboxClip(f as never, bbox)) as unknown as PolygonFeature[];
}

/**
 * The real coastline never moves, and the WhaleWatch grid's bbox/rows/cols
 * have been consistently the same shape since this project started — so
 * this mask is computed once per process and reused for every later call
 * with the same shape, rather than being recomputed on every 6h grid
 * refresh cycle for no reason.
 */
export function getLandMask(bbox: Bbox, rows: number, cols: number): LandMask {
  const key = `${bbox.join(",")}|${rows}|${cols}|${SUPERSAMPLE_FACTOR}`;
  if (cache?.key === key) return cache.landMask;

  const features = loadClippedLandFeatures(bbox);
  const mask = rasterizeLandMask(features, { bbox, rows, cols, factor: SUPERSAMPLE_FACTOR });
  const landMask: LandMask = { factor: SUPERSAMPLE_FACTOR, data: Buffer.from(mask).toString("base64") };

  cache = { key, landMask };
  return landMask;
}
