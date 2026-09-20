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
 * Rasterizes `grid.cells` into an RGBA pixel buffer, supersampled
 * `grid.landMask.factor`x beyond the grid's own `cols`x`rows` — one
 * source pixel per real model cell, nearest-neighbor-duplicated across
 * each cell's `factor x factor` block of output pixels, then trimmed to
 * the true coastline using `grid.landMask` (server-computed — see
 * `packages/api/src/raster/landMask.ts`'s doc comment for why). Pure and
 * DOM-free on purpose (no `document`/`canvas` touched here): the actual
 * `HTMLCanvasElement` construction lives in `rasterImageToDataUrl`, so
 * this half stays trivially unit-testable without a real 2D context.
 *
 * Feeding this into MapLibre as an `image`/`raster` source (see
 * `ProbabilityLayer.tsx`) lets the GPU's own bilinear texture sampling
 * additionally smooth between adjacent output pixels when the image is
 * scaled up on screen. Supersampling and GPU smoothing solve two
 * different problems: GPU smoothing blends *between* real cells;
 * supersampling is what lets the land mask trim a cell's rendered edges
 * to the real coastline instead of showing its full ~11km square
 * footprint. Verified live: a 1-pixel-per-cell version rendered visibly
 * over land near every bay along the CA coast (confirmed against NOAA's
 * own reference rendering for the same date, which clips to a real
 * coastline and shows none of that overlap) — the land mask exists
 * because GPU resampling alone (tried first) didn't fix it; even
 * `raster-resampling: "nearest"` (no blending at all) still showed the
 * same overlap, proving it was the cell's own square footprint at fault,
 * not the resampling mode.
 */
export function buildProbabilityRasterImage(grid: ProbabilityGrid): ProbabilityRasterImage {
  const { rows, cols, bbox, resolutionDegrees: step, landMask } = grid;
  const [minLon, , , maxLat] = bbox;
  const factor = landMask.factor;
  const superRows = rows * factor;
  const superCols = cols * factor;
  const maskBytes = base64ToBytes(landMask.data);
  const pixels = new Uint8ClampedArray(superRows * superCols * 4);

  // Iterates real cells (~15,270), not supersampled pixels (~1.2M at
  // factor=6): an earlier draft looped over every supersampled pixel and
  // did a Map lookup (with a freshly-allocated string key) per pixel, even
  // though every cell's factor*factor sub-block shares one color —
  // measured at 36ms/call. Looping cells first and filling each one's own
  // sub-block directly (still checking the land mask per sub-pixel, so
  // coastline trimming is unaffected) measured at 4.6ms/call for
  // identical output — about 8x faster, and it no longer needs the
  // intermediate Map at all.
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

    const [red, green, blue] = colorForProbability(cell.probability);
    const superRowStart = row * factor;
    const superColStart = col * factor;

    for (let dr = 0; dr < factor; dr++) {
      const r = superRowStart + dr;
      for (let dc = 0; dc < factor; dc++) {
        const c = superColStart + dc;
        const superIndex = r * superCols + c;
        if (bitAt(maskBytes, superIndex)) continue; // land — leave transparent

        const idx = superIndex * 4;
        pixels[idx] = red;
        pixels[idx + 1] = green;
        pixels[idx + 2] = blue;
        pixels[idx + 3] = 255;
      }
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
