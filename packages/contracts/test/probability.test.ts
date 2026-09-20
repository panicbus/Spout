import { describe, expect, it } from "vitest";
import { ProbabilityGridSchema } from "../src/probability.js";

const validAttribution = {
  datasetName: "WhaleWatch 2.0 blue whale habitat suitability",
  datasetId: "whalewatch2-blue-whale-ensemble",
  publisherName: "NOAA WhaleWatch 2.0",
  publisherId: "noaa-whalewatch2",
  license: { id: "public-domain", commercialUse: true },
};

function validGrid(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    species: "blue-whale",
    modelDate: "2026-09-15",
    generatedAt: "2026-09-18T10:10:35.000Z",
    bbox: [-134, 30, -115.5, 48],
    rows: 180,
    cols: 185,
    resolutionDegrees: 0.1,
    cells: [{ lat: 36.5, lon: -122.1, probability: 0.42 }],
    attribution: validAttribution,
    landMask: { factor: 6, data: "AA==" },
    ...overrides,
  };
}

describe("ProbabilityGridSchema", () => {
  it("accepts a well-formed grid matching the real WhaleWatch 2.0 raster shape", () => {
    const grid = ProbabilityGridSchema.parse(validGrid());
    expect(grid.rows * grid.cols).toBe(180 * 185);
  });

  it("rejects a species other than blue-whale — v1 has no other WhaleWatch model", () => {
    expect(() => ProbabilityGridSchema.parse(validGrid({ species: "orca" }))).toThrow();
  });

  it("rejects a probability outside [0, 1]", () => {
    expect(() =>
      ProbabilityGridSchema.parse(validGrid({ cells: [{ lat: 0, lon: 0, probability: 1.2 }] })),
    ).toThrow();
  });

  it("rejects a malformed bbox", () => {
    expect(() => ProbabilityGridSchema.parse(validGrid({ bbox: [-134, 30, -115.5] }))).toThrow();
  });

  it("rejects a modelDate that isn't YYYY-MM-DD — every renderer (formatDateStamp) assumes this exact shape", () => {
    expect(() => ProbabilityGridSchema.parse(validGrid({ modelDate: "Sept 15 2026" }))).toThrow();
    expect(() => ProbabilityGridSchema.parse(validGrid({ modelDate: "2026-09-15T00:00:00Z" }))).toThrow();
  });

  it("rejects more cells than rows*cols allows — the signature of a corrupted raster decode", () => {
    const tooManyCells = Array.from({ length: 181 * 185 }, () => ({
      lat: 0,
      lon: 0,
      probability: 0.5,
    }));
    expect(() =>
      ProbabilityGridSchema.parse(validGrid({ rows: 180, cols: 185, cells: tooManyCells })),
    ).toThrow(/cells\.length must not exceed rows \* cols/);
  });

  it("accepts a sparse grid where nodata cells were correctly dropped (the real raster keeps 15,270 of 33,300)", () => {
    const sparseCells = Array.from({ length: 15270 }, () => ({ lat: 0, lon: 0, probability: 0.5 }));
    const grid = ProbabilityGridSchema.parse(
      validGrid({ rows: 180, cols: 185, cells: sparseCells }),
    );
    expect(grid.cells).toHaveLength(15270);
  });

  it("requires a landMask — the client can't render a coastline-trimmed raster without one", () => {
    const { landMask: _landMask, ...withoutLandMask } = validGrid();
    expect(() => ProbabilityGridSchema.parse(withoutLandMask)).toThrow();
  });

  it("rejects a landMask with a non-positive factor", () => {
    expect(() =>
      ProbabilityGridSchema.parse(validGrid({ landMask: { factor: 0, data: "AA==" } })),
    ).toThrow();
  });

  it("rejects a landMask with empty data", () => {
    expect(() =>
      ProbabilityGridSchema.parse(validGrid({ landMask: { factor: 6, data: "" } })),
    ).toThrow();
  });
});
