import { describe, expect, it } from "vitest";
import { isExcludedDataset } from "../../src/normalize/exclusions.js";

describe("isExcludedDataset", () => {
  it("excludes SanctSound — thousands of hydrophone presence rows on ~8 fixed buoy coordinates, not sightings (ADR 0002)", () => {
    expect(isExcludedDataset("b3fc1d76-a50d-4a57-a2f3-425adfc59f9f")).toBe(true);
  });

  it("does not exclude an ordinary dataset", () => {
    expect(isExcludedDataset("6cb6ab2b-b5ac-4134-9b25-574dcfcbef09")).toBe(false);
  });
});
