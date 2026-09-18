import { describe, expect, it } from "vitest";
import { SightingsQuerySchema, TIME_WINDOWS, TimeWindowSchema } from "../src/filters.js";

describe("TimeWindowSchema", () => {
  it("accepts every window including 'latest', the iNaturalist-driven recency view (ADR 0003)", () => {
    for (const window of TIME_WINDOWS) {
      expect(TimeWindowSchema.parse(window)).toBe(window);
    }
  });

  it("rejects 'today' and 'this-week' — replaced by 'latest' because GBIF has zero records that fresh", () => {
    expect(() => TimeWindowSchema.parse("today")).toThrow();
    expect(() => TimeWindowSchema.parse("this-week")).toThrow();
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
