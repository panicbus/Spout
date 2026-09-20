import { describe, expect, it } from "vitest";
import { bitAt, rasterizeLandMask } from "../../src/raster/landMask.js";

/** Reads every bit of a mask into a `rows x cols` array of booleans, for readable assertions. */
function unpack(mask: Uint8Array, rows: number, cols: number): boolean[][] {
  const out: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) row.push(bitAt(mask, r * cols + c));
    out.push(row);
  }
  return out;
}

describe("rasterizeLandMask", () => {
  it("marks cells inside a simple square polygon as land, everything else as water", () => {
    const square = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [2, 2],
            [2, 8],
            [8, 8],
            [8, 2],
            [2, 2],
          ],
        ],
      },
    };

    const mask = rasterizeLandMask([square], { bbox: [0, 0, 10, 10], rows: 1, cols: 1, factor: 10 });
    const grid = unpack(mask, 10, 10);

    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const expected = r >= 2 && r <= 7 && c >= 2 && c <= 7;
        expect(grid[r]![c]).toBe(expected);
      }
    }
  });

  it("treats a hole (inner ring) as water via the even-odd rule, not land", () => {
    const donut = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [1, 1],
            [1, 9],
            [9, 9],
            [9, 1],
            [1, 1],
          ], // outer ring
          [
            [4, 4],
            [4, 6],
            [6, 6],
            [6, 4],
            [4, 4],
          ], // hole
        ],
      },
    };

    const mask = rasterizeLandMask([donut], { bbox: [0, 0, 10, 10], rows: 1, cols: 1, factor: 10 });

    // Center of the hole (col 5, row 4 -> lon 5.5, lat 5.5) is water.
    expect(bitAt(mask, 4 * 10 + 5)).toBe(false);
    // Just inside the outer ring but outside the hole (col 2, row 4 -> lon 2.5, lat 5.5) is land.
    expect(bitAt(mask, 4 * 10 + 2)).toBe(true);
  });

  it("handles a MultiPolygon by unioning all its parts", () => {
    const left = [
      [0, 0],
      [0, 4],
      [4, 4],
      [4, 0],
      [0, 0],
    ];
    const right = [
      [6, 6],
      [6, 10],
      [10, 10],
      [10, 6],
      [6, 6],
    ];
    const multi = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "MultiPolygon" as const, coordinates: [[left], [right]] },
    };

    const mask = rasterizeLandMask([multi], { bbox: [0, 0, 10, 10], rows: 1, cols: 1, factor: 10 });

    expect(bitAt(mask, 8 * 10 + 1)).toBe(true); // inside `left` (row 8 -> lat 1.5, col 1 -> lon 1.5)
    expect(bitAt(mask, 2 * 10 + 8)).toBe(true); // inside `right` (row 2 -> lat 7.5, col 8 -> lon 8.5)
    expect(bitAt(mask, 5 * 10 + 5)).toBe(false); // between the two, water
  });

  it("returns an all-water mask for an empty feature list", () => {
    const mask = rasterizeLandMask([], { bbox: [0, 0, 10, 10], rows: 1, cols: 1, factor: 10 });
    for (let i = 0; i < 100; i++) expect(bitAt(mask, i)).toBe(false);
  });
});
