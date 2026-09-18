import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeGri } from "../../src/raster/gri.js";
import { parseGrdHeader } from "../../src/raster/grd.js";
import { rasterToCells } from "../../src/raster/rasterToCells.js";

const GRI_PATH = fileURLToPath(
  new URL("../../../../fixtures/whalewatch/blwh_ensemble_2026-09-15.gri", import.meta.url),
);
const GRD_PATH = fileURLToPath(
  new URL("../../../../fixtures/whalewatch/blwh_ensemble_2026-09-15.grd", import.meta.url),
);

describe("rasterToCells", () => {
  it("maps a 2x2 grid to lat/lon assuming row 0 is the NORTH edge (R raster package convention), skipping NaN", () => {
    const header = { rows: 2, cols: 2, bbox: [-10, 0, -8, 2] as [number, number, number, number] };
    // Row 0 = north (lat 1-2), row 1 = south (lat 0-1).
    // Col 0 = west (lon -10..-9), col 1 = east (lon -9..-8).
    const values = [0.1, 0.2, NaN, 0.4];

    const cells = rasterToCells(values, header);

    expect(cells).toEqual([
      { lat: 1.5, lon: -9.5, probability: 0.1 }, // row 0, col 0: NW
      { lat: 1.5, lon: -8.5, probability: 0.2 }, // row 0, col 1: NE
      // row 1, col 0 was NaN — skipped
      { lat: 0.5, lon: -8.5, probability: 0.4 }, // row 1, col 1: SE
    ]);
  });

  it("throws if values.length doesn't match rows*cols", () => {
    expect(() =>
      rasterToCells([0.1, 0.2], { rows: 2, cols: 2, bbox: [-10, 0, -8, 2] }),
    ).toThrow(/length/i);
  });

  it("end-to-end against the real raster: the known maximum-probability cell lands off Point Conception, not inland Oregon", () => {
    // This is the orientation check that was done by hand (empirically,
    // by testing both hypotheses and rejecting the one that placed the
    // whale-probability maximum ~40 miles inland in central Oregon)
    // before writing this decoder — now permanent so a future refactor
    // can't silently flip north/south again.
    const grdText = readFileSync(GRD_PATH, "utf-8");
    const header = parseGrdHeader(grdText);
    const buffer = readFileSync(GRI_PATH);
    const values = decodeGri(buffer, header);

    const cells = rasterToCells(values, header);
    expect(cells).toHaveLength(15_270);

    const hottest = cells.reduce((max, cell) => (cell.probability > max.probability ? cell : max));
    expect(hottest.probability).toBeCloseTo(0.9714617729187012, 6);
    expect(hottest.lat).toBeCloseTo(34.15, 5);
    expect(hottest.lon).toBeCloseTo(-120.45, 5);
  });
});
