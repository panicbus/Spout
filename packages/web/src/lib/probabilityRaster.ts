import type { Bbox, ProbabilityGrid } from "@spout/contracts";

export interface ProbabilityRasterImage {
  width: number;
  height: number;
  /** RGBA, `width * height * 4` bytes, row-major. Nodata pixels are `[0,0,0,0]` — fully transparent, never a fabricated color. */
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

/**
 * Rasterizes `grid.cells` into an RGBA pixel buffer, `cols` wide by `rows`
 * tall — one pixel per real model cell, nodata cells left transparent.
 * Pure and DOM-free on purpose (no `document`/`canvas` touched here): the
 * actual `HTMLCanvasElement` construction lives in `rasterImageToDataUrl`,
 * so this half stays trivially unit-testable without a real 2D context.
 *
 * Feeding this into MapLibre as an `image`/`raster` source (see
 * `ProbabilityLayer.tsx`) lets the GPU's own bilinear texture sampling
 * smooth between adjacent cells when the image is scaled up on screen —
 * real interpolation of real model output, the same operation
 * `densifyProbabilityGrid` did on the CPU in an earlier draft of this
 * round, just computed once per pixel by the GPU instead of precomputing
 * extra GeoJSON points. Superior specifically at the coastline: texture
 * sampling blends smoothly right up to a transparent edge, whereas the
 * CPU approach had to drop any point missing even one of its four real
 * neighbors — verified live against the real WhaleWatch grid that this
 * dropped the vast majority of potential new points specifically in the
 * coastal band (the CPU version only gained ~14% more points there),
 * which is exactly where the model's interesting nearshore-high structure
 * lives. That empirical result is why this file exists instead of a
 * revived `densifyProbabilityGrid`.
 */
export function buildProbabilityRasterImage(grid: ProbabilityGrid): ProbabilityRasterImage {
  const { rows, cols, bbox, resolutionDegrees: step } = grid;
  const [minLon, , , maxLat] = bbox;
  const pixels = new Uint8ClampedArray(rows * cols * 4);

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

    const [r, g, b] = colorForProbability(cell.probability);
    const idx = (row * cols + col) * 4;
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = 255;
  }

  return { width: cols, height: rows, pixels };
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
