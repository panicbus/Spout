import { describe, expect, it } from "vitest";
import { BboxSchema, CA_COAST_BBOX } from "../src/bbox.js";

describe("CA_COAST_BBOX", () => {
  it("is itself a valid Bbox", () => {
    expect(() => BboxSchema.parse(CA_COAST_BBOX)).not.toThrow();
  });
});

describe("BboxSchema", () => {
  it("accepts a well-formed [minLon, minLat, maxLon, maxLat] bbox", () => {
    expect(BboxSchema.parse([-126, 32, -117, 42])).toEqual([-126, 32, -117, 42]);
  });

  it("rejects NaN in any position — a malformed query param must fail loudly, not silently query with NaN (which better-sqlite3 binds as NULL, making every BETWEEN clause match nothing)", () => {
    expect(() => BboxSchema.parse([NaN, 32, -117, 42])).toThrow();
  });

  it("rejects Infinity in any position", () => {
    expect(() => BboxSchema.parse([-126, 32, Infinity, 42])).toThrow();
  });

  it("rejects an inverted longitude range (minLon > maxLon)", () => {
    expect(() => BboxSchema.parse([-117, 32, -126, 42])).toThrow();
  });

  it("rejects an inverted latitude range (minLat > maxLat)", () => {
    expect(() => BboxSchema.parse([-126, 42, -117, 32])).toThrow();
  });
});
