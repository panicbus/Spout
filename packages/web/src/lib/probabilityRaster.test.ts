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

  it("duplicates a real cell's color across every supersampled sub-pixel (nearest-neighbor upsampling)", () => {
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

  it("interpolates color along the same ramp the circle layer used to render, at a true midpoint (not coincidentally exactly on a stop)", () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1];
    const grid = buildProbabilityGrid({
      rows: 1,
      cols: 1,
      resolutionDegrees: 1,
      bbox,
      cells: [cellCenterFixture(0, 0, 1, 1, bbox, 0.5)], // halfway between the 0.4 (cyan) and 0.6 (lime) stops
      landMask: allWaterMask(1, 1, 1),
    });

    const image = buildProbabilityRasterImage(grid);

    expect(Array.from(image.pixels.slice(0, 4))).toEqual([0, 255, 128, 255]);
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
