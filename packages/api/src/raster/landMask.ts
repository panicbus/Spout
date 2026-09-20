import { bitAt, type Bbox } from "@spout/contracts";

export { bitAt };

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Any GeoJSON `Feature<Polygon | MultiPolygon>` — kept minimal (not the
 * full `geojson` package's types) since this module only ever reads
 * `.geometry.type`/`.coordinates`.
 */
export interface PolygonFeature {
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

export interface LandMaskParams {
  bbox: Bbox;
  rows: number;
  cols: number;
  /** How many mask cells per native grid cell, per axis — see `buildLandMask`'s doc comment for why this needs to be well beyond 1. */
  factor: number;
}

function extractEdges(features: PolygonFeature[]): Edge[] {
  const edges: Edge[] = [];

  function addRing(ring: number[][]) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[i + 1]!;
      if (y1 === undefined || y2 === undefined || x1 === undefined || x2 === undefined) continue;
      if (y1 === y2) continue; // horizontal edges never cross a scanline
      edges.push({ x1, y1, x2, y2 });
    }
  }

  for (const feature of features) {
    const { geometry } = feature;
    if (geometry.type === "Polygon") {
      for (const ring of geometry.coordinates) addRing(ring);
    } else {
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) addRing(ring);
      }
    }
  }

  return edges;
}

/** Every x (longitude) where `edges` crosses the horizontal line `lat`, sorted ascending. */
function scanlineCrossings(edges: Edge[], lat: number): number[] {
  const xs: number[] = [];
  for (const { x1, y1, x2, y2 } of edges) {
    const yMin = Math.min(y1, y2);
    const yMax = Math.max(y1, y2);
    // Half-open interval [yMin, yMax) avoids double-counting a scanline that
    // passes exactly through a shared vertex between two edges.
    if (lat < yMin || lat >= yMax) continue;
    const t = (lat - y1) / (y2 - y1);
    xs.push(x1 + t * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  return xs;
}

function setBit(mask: Uint8Array, index: number): void {
  mask[index >> 3]! |= 1 << (index & 7);
}

/**
 * Rasterizes `features` (real coastline polygons) into a `rows*factor` x
 * `cols*factor` boolean bitmap (1 bit/cell, packed into `Uint8Array`; read
 * with `bitAt`), true where a cell's center is on land — via scanline
 * polygon fill (even-odd rule), not per-point polygon testing.
 *
 * Why this exists: a naive "test every supersampled point against the
 * polygon with `@turf/boolean-point-in-polygon`" approach was measured
 * against the real WhaleWatch grid bbox at `factor=6` (≈1.2M points, a
 * ~3,000-vertex CA-coast-clipped land polygon) at **21 seconds** — too
 * slow to compute per grid refresh. Scanline fill finds all of one row's
 * polygon crossings in one pass over the edges (not one polygon test per
 * point), then fills whole spans between crossing pairs directly — total
 * work is `O(superRows * edges)`, not `O(superRows * superCols * edges)`.
 *
 * `factor` must be well above 1: the underlying probability grid is only
 * ~0.1° (~11km) resolution, coarse enough that a single grid cell's
 * rendered footprint can span a real coastline feature (a bay mouth, a
 * peninsula). This mask exists specifically to let `packages/web`'s
 * raster renderer trim a cell's rendered edges to the true coastline
 * instead of showing its full square footprint — that only works if the
 * mask has more resolution than the grid cells it's trimming.
 */
export function rasterizeLandMask(features: PolygonFeature[], { bbox, rows, cols, factor }: LandMaskParams): Uint8Array {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const superRows = rows * factor;
  const superCols = cols * factor;
  const xres = (maxLon - minLon) / superCols;
  const yres = (maxLat - minLat) / superRows;

  const edges = extractEdges(features);
  const mask = new Uint8Array(Math.ceil((superRows * superCols) / 8));

  for (let r = 0; r < superRows; r++) {
    const lat = maxLat - (r + 0.5) * yres;
    const crossings = scanlineCrossings(edges, lat);

    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const lonStart = crossings[i]!;
      const lonEnd = crossings[i + 1]!;
      const colStart = Math.max(0, Math.ceil((lonStart - minLon) / xres - 0.5));
      const colEnd = Math.min(superCols - 1, Math.floor((lonEnd - minLon) / xres - 0.5));
      for (let c = colStart; c <= colEnd; c++) setBit(mask, r * superCols + c);
    }
  }

  return mask;
}
