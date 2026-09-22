import { describe, expect, it } from "vitest";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";
import { buildProbabilityRasterImage, imageCornersForBbox } from "./probabilityRaster.js";

/**
 * Real cells are never at a bbox edge — `packages/api/src/raster/rasterToCells.ts`
 * places every cell at its CENTER: `lat: ymax - (row + 0.5) * yres`,
 * `lon: xmin + (col + 0.5) * xres`. A fixture that instead puts cells
 * exactly on bbox corners can pass against a buggy row/col inversion
 * purely by coincidence — this helper reproduces the real convention so
 * these tests actually catch that class of bug (as one already did once
 * — see the `Math.floor` comment in `probabilityRaster.ts`).
 */
function cellCenterFixture(row: number, col: number, rows: number, cols: number, bbox: [number, number, number, number], probability: number) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const xres = (maxLon - minLon) / cols;
  const yres = (maxLat - minLat) / rows;
  return { lat: maxLat - (row + 0.5) * yres, lon: minLon + (col + 0.5) * xres, probability };
}

/** An all-water land mask (every bit 0) sized for `rows*factor x cols*factor`. */
function allWaterMask(rows: number, cols: number, factor: number) {
  const bits = rows * factor * cols * factor;
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  return { factor, data: Buffer.from(bytes).toString("base64") };
}

/** A land mask with exactly the given bit indices (into the `rows*factor x cols*factor` grid) set to land. */
function maskWithLandBits(rows: number, cols: number, factor: number, landIndices: number[]) {
  const bits = rows * factor * cols * factor;
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  for (const i of landIndices) bytes[i >> 3]! |= 1 << (i & 7);
  return { factor, data: Buffer.from(bytes).toString("base64") };
}

describe("buildProbabilityRasterImage", () => {
  it("sizes the pixel buffer as (cols*factor) x (rows*factor) x 4 (RGBA)", () => {
    const grid = buildProbabilityGrid({
      rows: 2,
      cols: 2,
      resolutionDegrees: 1,
      bbox: [0, 0, 2, 2],
      cells: [],
      landMask: allWaterMask(2, 2, 3),
    });

    const image = buildProbabilityRasterImage(grid);

    expect(image.width).toBe(2 * 3);
    expect(image.height).toBe(2 * 3);
    expect(image.pixels).toHaveLength(2 * 3 * 2 * 3 * 4);
  });

  it("leaves nodata cells fully transparent (alpha 0), never fabricating a color for a real gap", () => {
    const bbox: [number, number, number, number] = [0, 0, 2, 2];
    const grid = buildProbabilityGrid({
      rows: 2,
      cols: 2,
      resolutionDegrees: 1,
      bbox,
      cells: [cellCenterFixture(0, 0, 2, 2, bbox, 1)], // only row 0, col 0 is real
      landMask: allWaterMask(2, 2, 1),
    });

    const image = buildProbabilityRasterImage(grid);

    // row 0, col 1 (native, factor=1 so 1:1 with supersampled): still nodata.
    const topRightIdx = (0 * 2 + 1) * 4;
    expect(Array.from(image.pixels.slice(topRightIdx, topRightIdx + 4))).toEqual([0, 0, 0, 0]);
  });

  it("fills every supersampled sub-pixel with the same flat color for a lone cell with no real neighbors (bilinear interpolation degenerates to a flat value when there's nothing to blend toward)", () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1];
    const grid = buildProbabilityGrid({
      rows: 1,
      cols: 1,
      resolutionDegrees: 1,
      bbox,
      cells: [cellCenterFixture(0, 0, 1, 1, bbox, 1)], // probability 1 -> red
      landMask: allWaterMask(1, 1, 2),
    });

    const image = buildProbabilityRasterImage(grid);

    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    for (let i = 0; i < 4; i++) {
      const idx = i * 4;
      expect(Array.from(image.pixels.slice(idx, idx + 4))).toEqual([255, 0, 0, 255]);
    }
  });

  it("trims individual supersampled sub-pixels to transparent where the land mask says land, even though the containing native cell has real data", () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1];
    const grid = buildProbabilityGrid({
      rows: 1,
      cols: 1,
      resolutionDegrees: 1,
      bbox,
      cells: [cellCenterFixture(0, 0, 1, 1, bbox, 1)],
      // 2x2 supersampled grid; mark only the top-left sub-pixel (index 0) as land.
      landMask: maskWithLandBits(1, 1, 2, [0]),
    });

    const image = buildProbabilityRasterImage(grid);

    expect(Array.from(image.pixels.slice(0, 4))).toEqual([0, 0, 0, 0]); // top-left: land, transparent
    expect(Array.from(image.pixels.slice(4, 8))).toEqual([255, 0, 0, 255]); // top-right: water, colored
    expect(Array.from(image.pixels.slice(8, 12))).toEqual([255, 0, 0, 255]); // bottom-left: water, colored
    expect(Array.from(image.pixels.slice(12, 16))).toEqual([255, 0, 0, 255]); // bottom-right: water, colored
  });

  it("never drops the last row/column of real cells (regression: a naive Math.round of a center coordinate rounds row+0.5 UP to row+1, pushing the last row/col out of bounds)", () => {
    const bbox: [number, number, number, number] = [0, 0, 3, 3];
    const rows = 3;
    const cols = 3;
    const grid = buildProbabilityGrid({
      rows,
      cols,
      resolutionDegrees: 1,
      bbox,
      cells: [cellCenterFixture(rows - 1, cols - 1, rows, cols, bbox, 1)],
      landMask: allWaterMask(rows, cols, 1),
    });

    const image = buildProbabilityRasterImage(grid);

    const bottomRightIdx = ((rows - 1) * cols + (cols - 1)) * 4;
    expect(Array.from(image.pixels.slice(bottomRightIdx, bottomRightIdx + 4))).toEqual([255, 0, 0, 255]);
    const opaqueCount = image.pixels.filter((_, i) => i % 4 === 3 && image.pixels[i] === 255).length;
    expect(opaqueCount).toBe(1);
  });

  it("interpolates color (and alpha) along the ramp at a true midpoint (not coincidentally exactly on a stop)", () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1];
    const grid = buildProbabilityGrid({
      rows: 1,
      cols: 1,
      resolutionDegrees: 1,
      bbox,
      cells: [cellCenterFixture(0, 0, 1, 1, bbox, 0.375)], // halfway between the 0.25 (green) and 0.5 (yellow) stops
      landMask: allWaterMask(1, 1, 1),
    });

    const image = buildProbabilityRasterImage(grid);

    // t = 0.5: r = lerp(0,255,0.5) = 128, g = lerp(200,255,0.5) = 228,
    // b = 0, alpha = 0.5 + (0.75-0.5)*0.5 = 0.625 -> round(0.625*255) = 159.
    expect(Array.from(image.pixels.slice(0, 4))).toEqual([128, 228, 0, 159]);
  });

  it("smoothly interpolates probability between adjacent cells, producing a genuine gradient across the boundary rather than a hard step (regression: an earlier version nearest-neighbor-duplicated each cell's color across its whole supersampled block, which looked identical to the naive per-cell circle rendering it was meant to improve on)", () => {
    const bbox: [number, number, number, number] = [0, 0, 2, 1];
    const grid = buildProbabilityGrid({
      rows: 1,
      cols: 2,
      resolutionDegrees: 1,
      bbox,
      cells: [
        cellCenterFixture(0, 0, 1, 2, bbox, 0),
        cellCenterFixture(0, 1, 1, 2, bbox, 0.2),
      ],
      landMask: allWaterMask(1, 2, 4),
    });

    const image = buildProbabilityRasterImage(grid); // superCols = 8, superRows = 4
    // Sampling alpha (index 3), not red: both cells' probabilities (0 and
    // 0.2) fall inside the ramp's single green segment (stops 0-0.25),
    // where RGB is flat — only alpha actually varies across that span, so
    // it's the channel that will actually catch a hard nearest-neighbor
    // step here, and it's monotonic across the *whole* ramp regardless of
    // which segment a given fixture's probabilities land in.
    const alphas = Array.from({ length: 8 }, (_, c) => image.pixels[c * 4 + 3]!);

    // A hard nearest-neighbor step would produce exactly 2 distinct
    // values (a flat block, then another flat block); real bilinear
    // blending produces a smoothly increasing ramp with more steps than
    // that, monotonically non-decreasing left to right (probability only
    // increases from cell 0 to cell 1 in this fixture).
    for (let c = 1; c < alphas.length; c++) {
      expect(alphas[c]).toBeGreaterThanOrEqual(alphas[c - 1]!);
    }
    expect(new Set(alphas).size).toBeGreaterThan(2);
  });

  it("interpolates in BOTH directions at once (row and column), at an exact hand-computed value — not just 'monotonic and more than 2 values,' which a broken row-direction blend could still satisfy (a review pass proved this by temporarily gutting fy-direction blending: all prior tests here still passed)", () => {
    const bbox: [number, number, number, number] = [0, 0, 2, 2];
    const grid = buildProbabilityGrid({
      rows: 2,
      cols: 2,
      resolutionDegrees: 1,
      bbox,
      cells: [
        cellCenterFixture(0, 0, 2, 2, bbox, 0), // top-left
        cellCenterFixture(0, 1, 2, 2, bbox, 0.2), // top-right
        cellCenterFixture(1, 0, 2, 2, bbox, 0.4), // bottom-left
        cellCenterFixture(1, 1, 2, 2, bbox, 0.6), // bottom-right
      ],
      landMask: allWaterMask(2, 2, 4),
    });

    const image = buildProbabilityRasterImage(grid); // superRows = superCols = 8

    // Pixel (r=4, c=4): fracRow = fracCol = (4.5)/4 - 0.5 = 0.625, i.e.
    // 62.5% of the way from row/col 0 to row/col 1 in BOTH directions at
    // once. Hand-computed: top = 0 + (0.2-0)*0.625 = 0.125,
    // bottom = 0.4 + (0.6-0.4)*0.625 = 0.525,
    // result = 0.125 + (0.525-0.125)*0.625 = 0.375 — the same probability,
    // and so the same hand-computed color/alpha, as the "true midpoint"
    // test above: [128, 228, 0, 159].
    const idx = (4 * 8 + 4) * 4;
    expect(Array.from(image.pixels.slice(idx, idx + 4))).toEqual([128, 228, 0, 159]);
  });

  it("falls back to a cell's own flat value (not a fabricated blend) when one of its bilinear neighbors is real nodata, rather than interpolating across a genuine gap", () => {
    const bbox: [number, number, number, number] = [0, 0, 2, 2];
    const grid = buildProbabilityGrid({
      rows: 2,
      cols: 2,
      resolutionDegrees: 1,
      bbox,
      cells: [
        cellCenterFixture(0, 0, 2, 2, bbox, 0.2), // top-left only; the other 3 native cells are nodata
      ],
      landMask: allWaterMask(2, 2, 3),
    });

    const image = buildProbabilityRasterImage(grid); // superCols = superRows = 6

    // The pixel sitting exactly at the real cell's own center must show
    // its flat, un-blended color — never a value fabricated by blending
    // toward a neighbor that has no real data.
    const centerIdx = (1 * 6 + 1) * 4; // roughly the top-left native cell's own center pixel
    const [r, g, b, a] = image.pixels.slice(centerIdx, centerIdx + 4);
    // probability 0.2 is 80% of the way from the ramp's transparent green
    // floor (stop 0) to its half-opacity green stop (0.25): alpha =
    // round(0.8 * 0.5 * 255) = 102 — real, modest confidence renders
    // faint, never the fully-opaque flat value a binary "any real data is
    // opaque" rule would have given, and never nodata's alpha 0 either,
    // proving this is the cell's own real value, not a fallback default.
    expect(a).toBe(102);
    expect([r, g, b]).toEqual([0, 200, 0]);
  });

  it("treats a non-finite probability (NaN/Infinity) as nodata — transparent, never fabricating a color", () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1];
    const grid = buildProbabilityGrid({
      rows: 1,
      cols: 1,
      resolutionDegrees: 1,
      bbox,
      cells: [cellCenterFixture(0, 0, 1, 1, bbox, NaN)],
      landMask: allWaterMask(1, 1, 1),
    });

    const image = buildProbabilityRasterImage(grid);

    expect(Array.from(image.pixels.slice(0, 4))).toEqual([0, 0, 0, 0]);
  });
});

describe("imageCornersForBbox", () => {
  it("returns the four corners in MapLibre's expected top-left/top-right/bottom-right/bottom-left order", () => {
    expect(imageCornersForBbox([-10, -5, 10, 5])).toEqual([
      [-10, 5],
      [10, 5],
      [10, -5],
      [-10, -5],
    ]);
  });
});
