import { describe, expect, it } from "vitest";
import { SightingsQuerySchema, TIME_WINDOWS, TIME_WINDOW_DAYS, TimeWindowSchema } from "../src/filters.js";

describe("TimeWindowSchema", () => {
  it("rejects 'today' and 'this-week' — replaced by 'latest' because GBIF has zero records that fresh", () => {
    expect(() => TimeWindowSchema.parse("today")).toThrow();
    expect(() => TimeWindowSchema.parse("this-week")).toThrow();
  });
});

describe("TIME_WINDOW_DAYS", () => {
  it("has exactly one entry per TIME_WINDOWS value, the single source of truth for both the API's sinceDate cutoff and the web package's ageBucket visual boundaries", () => {
    for (const window of TIME_WINDOWS) {
      expect(TIME_WINDOW_DAYS[window]).toBeGreaterThan(0);
    }
    expect(Object.keys(TIME_WINDOW_DAYS)).toHaveLength(TIME_WINDOWS.length);
  });

  it("maps 'latest' to 7 days and '30d' to 30 days, per ADR 0003", () => {
    expect(TIME_WINDOW_DAYS.latest).toBe(7);
    expect(TIME_WINDOW_DAYS["30d"]).toBe(30);
  });
});

describe("SightingsQuerySchema", () => {
  it("defaults window to 30d per ADR 0003", () => {
    const query = SightingsQuerySchema.parse({});
    expect(query.window).toBe("30d");
  });

  it("defaults commercialOnly to false — full corpus by default per ADR 0003", () => {
    const query = SightingsQuerySchema.parse({});
    expect(query.commercialOnly).toBe(false);
  });

  it("accepts an explicit bbox, species list, and tier filter together", () => {
    const query = SightingsQuerySchema.parse({
      bbox: [-126, 32, -117, 42],
      species: ["blue-whale", "gray-whale"],
      tier: ["research"],
      window: "12m",
      commercialOnly: true,
    });
    expect(query.species).toEqual(["blue-whale", "gray-whale"]);
    expect(query.commercialOnly).toBe(true);
  });
});
