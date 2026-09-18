import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGrdHeader } from "../../src/raster/grd.js";

const FIXTURE_PATH = fileURLToPath(
  new URL(
    "../../../../fixtures/whalewatch/blwh_ensemble_2026-09-15.grd",
    import.meta.url,
  ),
);

describe("parseGrdHeader", () => {
  it("parses the real WhaleWatch 2.0 .grd header into its georeference fields", () => {
    const text = readFileSync(FIXTURE_PATH, "utf-8");
    const header = parseGrdHeader(text);

    expect(header).toEqual({
      rows: 180,
      cols: 185,
      bbox: [-134, 30, -115.5, 48],
      nodataValue: -3.4e38,
    });
  });

  it("parses a minimal synthetic header with the same shape", () => {
    const text = [
      "[georeference]",
      "nrows=2",
      "ncols=3",
      "xmin=-10",
      "ymin=0",
      "xmax=-4",
      "ymax=10",
      "[data]",
      "nodatavalue=-3.4e+38",
    ].join("\n");

    expect(parseGrdHeader(text)).toEqual({
      rows: 2,
      cols: 3,
      bbox: [-10, 0, -4, 10],
      nodataValue: -3.4e38,
    });
  });

  it("throws a clear error when a required field is missing, rather than returning NaN silently", () => {
    expect(() => parseGrdHeader("[georeference]\nnrows=2\n")).toThrow(/ncols/);
  });

  it("throws when a required field is present but empty, rather than silently coercing it to 0 via Number('')", () => {
    const text = [
      "[georeference]",
      "nrows=2",
      "ncols=3",
      "xmin=", // present, empty — Number("") is 0, not NaN, so a naive check wouldn't catch this
      "ymin=0",
      "xmax=-4",
      "ymax=10",
      "[data]",
      "nodatavalue=-3.4e+38",
    ].join("\n");

    expect(() => parseGrdHeader(text)).toThrow(/xmin/);
  });

  it("throws when a required field is present but not a number", () => {
    const text = [
      "[georeference]",
      "nrows=2",
      "ncols=3",
      "xmin=not-a-number",
      "ymin=0",
      "xmax=-4",
      "ymax=10",
      "[data]",
      "nodatavalue=-3.4e+38",
    ].join("\n");

    expect(() => parseGrdHeader(text)).toThrow(/xmin/);
  });
});
