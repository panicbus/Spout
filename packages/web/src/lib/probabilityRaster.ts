import { bitAt, type Bbox, type ProbabilityGrid } from "@spout/contracts";

export interface ProbabilityRasterImage {
  width: number;
  height: number;
  /** RGBA, `width * height * 4` bytes, row-major. Nodata/land pixels are `[0,0,0,0]` — fully transparent, never a fabricated color. */
  pixels: Uint8ClampedArray;
}

/** `[topLeft, topRight, bottomRight, bottomLeft]` — the corner order MapLibre's `image` source requires. */
export type ImageCorners = [[number, number], [number, number], [number, number], [number, number]];

/** Mirrors the blue→red ramp `ProbabilityLayer`'s old `circle-color` interpolate expression used, for visual continuity with prior rounds and with NOAA's own color scale. */
const COLOR_STOPS: { stop: number; rgb: [number, number, number] }[] = [
  { stop: 0, rgb: [27, 20, 100] }, // #1b1464
  { stop: 0.2, rgb: [65, 105, 225] }, // royalblue
  { stop: 0.4, rgb: [0, 255, 255] }, // cyan
  { stop: 0.6, rgb: [0, 255, 0] }, // lime
  { stop: 0.8, rgb: [255, 255, 0] }, // yellow
  { stop: 1, rgb: [255, 0, 0] }, // red
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function clamp(v: number, max: number): number {
  return v < 0 ? 0 : v > max ? max : v;
}

function colorForProbability(probability: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, probability));
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const lower = COLOR_STOPS[i]!;
    const upper = COLOR_STOPS[i + 1]!;
    if (clamped <= upper.stop) {
      const t = (clamped - lower.stop) / (upper.stop - lower.stop);
      return [lerp(lower.rgb[0], upper.rgb[0], t), lerp(lower.rgb[1], upper.rgb[1], t), lerp(lower.rgb[2], upper.rgb[2], t)];
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1]!.rgb;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Bilinearly interpolates the probability at fractional native-grid
 * position `(fracRow, fracCol)` from `values` (row-major, `NaN` = nodata).
 * `fracRow`/`fracCol` are in native-cell-index units (not supersampled
 * pixel units) — e.g. `fracRow = 2.0` is exactly native row 2's own
 * center, `fracRow = 2.5` is exactly halfway between rows 2 and 3.
 *
 * Two different "does this pixel have data" checks, deliberately: the
 * NEAREST native cell (rounded, clamped) decides whether this pixel has
 * any real underlying data at all — matching the same coverage footprint
 * every earlier version of this function used (a pixel belongs to
 * exactly one native cell). The four surrounding corners (floored,
 * clamped, weighted by the fractional position) are used ONLY to blend a
 * smooth value when all four are real — if any one of them is nodata,
 * this falls back to the nearest cell's own flat value rather than
 * fabricating a blend across a real gap in the model's coverage (the
 * same "never interpolate across nodata" principle an earlier CPU-side
 * densify attempt this project tried and discarded — see git history —
 * already established, just applied here at the pixel level instead of
 * adding new points).
 */
function bilinearProbabilityAt(values: Float64Array, rows: number, cols: number, fracRow: number, fracCol: number): number {
  const nearestRow = clamp(Math.round(fracRow), rows - 1);
  const nearestCol = clamp(Math.round(fracCol), cols - 1);
  const self = values[nearestRow * cols + nearestCol]!;
  if (Number.isNaN(self)) return NaN;

  const row0 = clamp(Math.floor(fracRow), rows - 1);
  const row1 = clamp(row0 + 1, rows - 1);
  const col0 = clamp(Math.floor(fracCol), cols - 1);
  const col1 = clamp(col0 + 1, cols - 1);
  // Clamped (not just computed), so a fractional position beyond the
  // grid's edge (the half-cell margin around the outermost row/col)
  // reads as this cell's own flat value instead of extrapolating past it.
  const fy = clamp(fracRow - row0, 1);
  const fx = clamp(fracCol - col0, 1);

  const v00 = values[row0 * cols + col0]!;
  const v10 = values[row0 * cols + col1]!;
  const v01 = values[row1 * cols + col0]!;
  const v11 = values[row1 * cols + col1]!;
  if (Number.isNaN(v00) || Number.isNaN(v10) || Number.isNaN(v01) || Number.isNaN(v11)) return self;

  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Rasterizes `grid.cells` into an RGBA pixel buffer, supersampled
 * `grid.landMask.factor`x beyond the grid's own `cols`x`rows`, with the
 * probability at every output pixel bilinearly interpolated between the
 * real model cells around it (`bilinearProbabilityAt`) and then trimmed
 * to the true coastline using `grid.landMask` (server-computed — see
 * `packages/api/src/raster/landMask.ts`'s doc comment for why). Pure and
 * DOM-free on purpose (no `document`/`canvas` touched here): the actual
 * `HTMLCanvasElement` construction lives in `rasterImageToDataUrl`, so
 * this half stays trivially unit-testable without a real 2D context.
 *
 * Supersampling and interpolation solve two different problems here —
 * the land mask needs finer-than-grid resolution to trim a cell's edges
 * to the real coastline (verified live: a 1-pixel-per-cell version
 * rendered visibly over land near every bay along the CA coast, and even
 * `raster-resampling: "nearest"`, zero GPU blending, showed the same
 * overlap — proving it was each cell's own ~11km square footprint at
 * fault, not the resampling mode); genuine smoothness between adjacent
 * cells needs real interpolation, computed here, not left to the GPU. An
 * earlier version of this function nearest-neighbor-duplicated each
 * cell's flat color across its whole supersampled block and relied on
 * MapLibre's GPU `raster-resampling: "linear"` to blend between cells at
 * display time — but GPU blending only softens roughly one output
 * pixel's width, and supersampling had shrunk that width to a fraction
 * of each cell's true size, so the visible result was blockier than the
 * single-pixel-per-cell rendering from before the land mask existed (a
 * real user caught this by screenshot comparison). Interpolating here,
 * once, at build time, fixes that regardless of GPU resampling mode.
 *
 * Uses a flat `Float64Array` (not a `Map` keyed by a `"row,col"` string)
 * for the per-cell lookup table: a `Map`-based version of just the
 * bilinear lookup math (4 gets + arithmetic, no color/mask work) measured
 * 185ms/call against the real grid shape (180x185 cells, factor=6,
 * ~1.2M output pixels); swapping to this flat array brought that same
 * isolated lookup down to ~11-15ms/call — avoiding per-pixel string
 * allocation and hashing on a ~1.2M-iteration hot path. The full pipeline
 * (this lookup plus `colorForProbability` plus the land-mask bit check,
 * measured together) costs more than that lookup alone: ~35-50ms/call —
 * `colorForProbability` now runs once per output PIXEL (~1.2M times)
 * rather than once per native CELL (~33K times, true of every version of
 * this function before supersampling existed), and that per-pixel color
 * computation costs roughly as much as the interpolation itself. Still a
 * one-time cost per grid load (see `ProbabilityLayer.tsx`/
 * `useImageMapLayer.ts` — not per frame/pan/zoom), so not worth
 * optimizing further absent evidence it's actually felt.
 */
export function buildProbabilityRasterImage(grid: ProbabilityGrid): ProbabilityRasterImage {
  const { rows, cols, bbox, resolutionDegrees: step, landMask } = grid;
  const [minLon, , , maxLat] = bbox;
  const factor = landMask.factor;
  const superRows = rows * factor;
  const superCols = cols * factor;
  const maskBytes = base64ToBytes(landMask.data);

  const values = new Float64Array(rows * cols).fill(NaN);
  for (const cell of grid.cells) {
    // A non-finite probability (NaN/Infinity) must render exactly like a
    // missing cell — transparent — not fall through `colorForProbability`'s
    // clamp (`Math.max`/`Math.min` propagate NaN rather than clamping it)
    // into its final `return`, which would silently paint it as the
    // top-of-scale color (red — "certain presence") instead of "unknown."
    if (!Number.isFinite(cell.probability)) continue;

    // `Math.floor`, not `Math.round`: real cells sit at their CELL CENTER
    // (`rasterToCells.ts`: `lat: ymax - (row + 0.5) * yres`), so this
    // division is always exactly `row + 0.5` for a real cell — `round`
    // pushes every one of them one pixel south/east (`row+1`), silently
    // dropping the entire last real row/column out of bounds. `floor`
    // recovers the true integer index in every case.
    const row = Math.floor((maxLat - cell.lat) / step);
    const col = Math.floor((cell.lon - minLon) / step);
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;

    values[row * cols + col] = cell.probability;
  }

  const pixels = new Uint8ClampedArray(superRows * superCols * 4);

  for (let r = 0; r < superRows; r++) {
    // Native-cell-index-space position of this row of supersampled
    // pixels — e.g. at factor=6, supersampled row 2's center is at
    // 2.5/6 - 0.5 ≈ -0.083, just short of native row 0's own center
    // (fracRow 0.0), on its way toward row -1 (which doesn't exist,
    // hence the clamping inside `bilinearProbabilityAt`).
    const fracRow = (r + 0.5) / factor - 0.5;
    for (let c = 0; c < superCols; c++) {
      const superIndex = r * superCols + c;
      if (bitAt(maskBytes, superIndex)) continue; // land — leave transparent

      const fracCol = (c + 0.5) / factor - 0.5;
      const probability = bilinearProbabilityAt(values, rows, cols, fracRow, fracCol);
      if (Number.isNaN(probability)) continue; // nodata — leave transparent

      const [red, green, blue] = colorForProbability(probability);
      const idx = superIndex * 4;
      pixels[idx] = red;
      pixels[idx + 1] = green;
      pixels[idx + 2] = blue;
      pixels[idx + 3] = 255;
    }
  }

  return { width: superCols, height: superRows, pixels };
}

/** The four corners MapLibre's `image` source coordinates need, derived from the grid's own bbox. */
export function imageCornersForBbox(bbox: Bbox): ImageCorners {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return [
    [minLon, maxLat],
    [maxLon, maxLat],
    [maxLon, minLat],
    [minLon, minLat],
  ];
}
