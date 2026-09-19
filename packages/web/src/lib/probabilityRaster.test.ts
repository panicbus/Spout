import { describe, expect, it } from "vitest";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";
import { buildProbabilityRasterImage, imageCornersForBbox } from "./probabilityRaster.js";

/**
 * Real cells are never at a bbox edge — `packages/api/src/raster/rasterToCells.ts`
 * places every cell at its CENTER: `lat: ymax - (row + 0.5) * yres`,
 * `lon: xmin + (col + 0.5) * xres`. A fixture that instead puts cells
 * exactly on bbox corners (as an earlier version of this test file did)
 * can pass against a buggy `Math.round`-based row/col inversion purely by
 * coincidence (rounding 0 or 1 exactly), without ever exercising the real
 * "always exactly `row + 0.5`" case every production cell actually hits.
 * This helper reproduces the real convention so these tests catch that.
 */
function cellCenterFixture(row: number, col: number, rows: number, cols: number, bbox: [number, number, number, number], probability: number) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const xres = (maxLon - minLon) / cols;
  const yres = (maxLat - minLat) / rows;
  return { lat: maxLat - (row + 0.5) * yres, lon: minLon + (col + 0.5) * xres, probability };
}

describe("buildProbabilityRasterImage", () => {
  it("sizes the pixel buffer as width(cols) x height(rows) x 4 (RGBA)", () => {
    const grid = buildProbabilityGrid({ rows: 2, cols: 2, resolutionDegrees: 1, bbox: [0, 0, 2, 2], cells: [] });

    const image = buildProbabilityRasterImage(grid);

    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(image.pixels).toHaveLength(2 * 2 * 4);
  });

  it("leaves nodata cells fully transparent (alpha 0), never fabricating a color for a real gap", () => {
    const bbox: [number, number, number, number] = [0, 0, 2, 2];
    const grid = buildProbabilityGrid({
      rows: 2,
      cols: 2,
      resolutionDegrees: 1,
      bbox,
      cells: [cellCenterFixture(0, 0, 2, 2, bbox, 1)], // only row 0, col 0 is real
    });

    const image = buildProbabilityRasterImage(grid);

    // row 0, col 1: still nodata.
    const topRightIdx = (0 * 2 + 1) * 4;
    expect(Array.from(image.pixels.slice(topRightIdx, topRightIdx + 4))).toEqual([0, 0, 0, 0]);
  });

  it("places each real cell (at its true center coordinate, not a bbox edge) at its correct row/col pixel", () => {
    const bbox: [number, number, number, number] = [0, 0, 2, 2];
    const grid = buildProbabilityGrid({
      rows: 2,
      cols: 2,
      resolutionDegrees: 1,
      bbox,
      cells: [
        cellCenterFixture(0, 0, 2, 2, bbox, 0), // top-left
        cellCenterFixture(1, 1, 2, 2, bbox, 1), // bottom-right
      ],
    });

    const image = buildProbabilityRasterImage(grid);

    const topLeftIdx = (0 * 2 + 0) * 4;
    expect(Array.from(image.pixels.slice(topLeftIdx, topLeftIdx + 4))).toEqual([27, 20, 100, 255]); // probability 0
    const bottomRightIdx = (1 * 2 + 1) * 4;
    expect(Array.from(image.pixels.slice(bottomRightIdx, bottomRightIdx + 4))).toEqual([255, 0, 0, 255]); // probability 1
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
      cells: [cellCenterFixture(rows - 1, cols - 1, rows, cols, bbox, 1)], // the real bottom-right-most cell
    });

    const image = buildProbabilityRasterImage(grid);

    const bottomRightIdx = ((rows - 1) * cols + (cols - 1)) * 4;
    expect(Array.from(image.pixels.slice(bottomRightIdx, bottomRightIdx + 4))).toEqual([255, 0, 0, 255]);
    // The total opaque-pixel count must be exactly 1 — a dropped/misplaced
    // cell would either leave this pixel transparent or set some OTHER
    // pixel instead.
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
