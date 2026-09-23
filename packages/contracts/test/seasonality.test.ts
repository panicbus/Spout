import { describe, expect, it } from "vitest";
import {
  SeasonalityQuerySchema,
  SeasonalityResponseSchema,
  SeasonalityYearQuerySchema,
  SeasonalityYearResponseSchema,
} from "../src/seasonality.js";

describe("SeasonalityQuerySchema", () => {
  it("parses lat/lon/date from query-string-shaped input", () => {
    const query = SeasonalityQuerySchema.parse({ lat: "36.6", lon: "-121.9", date: "2026-09-12" });
    expect(query).toMatchObject({ lat: 36.6, lon: -121.9, date: "2026-09-12" });
  });

  it("defaults radiusKm to 50 when not given", () => {
    const query = SeasonalityQuerySchema.parse({ lat: "36.6", lon: "-121.9", date: "2026-09-12" });
    expect(query.radiusKm).toBe(50);
  });

  it("rejects a lat outside +/-90", () => {
    expect(() =>
      SeasonalityQuerySchema.parse({ lat: "132", lon: "-121.9", date: "2026-09-12" }),
    ).toThrow();
  });

  it("rejects a malformed date", () => {
    expect(() =>
      SeasonalityQuerySchema.parse({ lat: "36.6", lon: "-121.9", date: "Sept 12" }),
    ).toThrow();
  });

  it("rejects a non-positive radiusKm", () => {
    expect(() =>
      SeasonalityQuerySchema.parse({ lat: "36.6", lon: "-121.9", date: "2026-09-12", radiusKm: "0" }),
    ).toThrow();
  });
});

describe("SeasonalityResponseSchema", () => {
  function validResponse(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      month: 9,
      species: [
        { species: "humpback-whale", share: 0.86, sampleSize: 7081 },
        { species: "blue-whale", share: undefined, sampleSize: 3 },
      ],
      ...overrides,
    };
  }

  it("accepts a well-formed response, share omitted below the sample-size threshold", () => {
    const parsed = SeasonalityResponseSchema.parse(validResponse());
    expect(parsed.species[1]?.share).toBeUndefined();
  });

  it("rejects a share outside [0, 1]", () => {
    expect(() =>
      SeasonalityResponseSchema.parse(
        validResponse({ species: [{ species: "orca", share: 1.5, sampleSize: 10 }] }),
      ),
    ).toThrow();
  });

  it("rejects a month outside 1-12", () => {
    expect(() => SeasonalityResponseSchema.parse(validResponse({ month: 13 }))).toThrow();
  });

  it("accepts an optional estimatedDensity (ECMM habitat-model enrichment, Phase 4) and rejects a negative one", () => {
    const parsed = SeasonalityResponseSchema.parse(
      validResponse({ species: [{ species: "humpback-whale", share: 0.86, sampleSize: 7081, estimatedDensity: 2.58 }] }),
    );
    expect(parsed.species[0]?.estimatedDensity).toBe(2.58);

    expect(() =>
      SeasonalityResponseSchema.parse(
        validResponse({ species: [{ species: "humpback-whale", share: 0.86, sampleSize: 7081, estimatedDensity: -1 }] }),
      ),
    ).toThrow();
  });
});

describe("SeasonalityYearQuerySchema", () => {
  it("parses lat/lon from query-string-shaped input, with no date required", () => {
    const query = SeasonalityYearQuerySchema.parse({ lat: "36.6", lon: "-121.9" });
    expect(query).toMatchObject({ lat: 36.6, lon: -121.9, radiusKm: 50 });
  });

  it("rejects a lat outside +/-90", () => {
    expect(() => SeasonalityYearQuerySchema.parse({ lat: "132", lon: "-121.9" })).toThrow();
  });
});

describe("SeasonalityYearResponseSchema", () => {
  function validYearResponse(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      species: [
        {
          species: "humpback-whale",
          months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, share: 0.1, sampleSize: 500 })),
        },
      ],
      ...overrides,
    };
  }

  it("accepts a well-formed year response with 12 months", () => {
    const parsed = SeasonalityYearResponseSchema.parse(validYearResponse());
    expect(parsed.species[0]?.months).toHaveLength(12);
  });

  it("omits share independently per month, below the sample-size threshold", () => {
    const parsed = SeasonalityYearResponseSchema.parse(
      validYearResponse({
        species: [
          {
            species: "gray-whale",
            months: [
              { month: 1, share: 0.4, sampleSize: 500 },
              { month: 6, share: undefined, sampleSize: 2 },
            ],
          },
        ],
      }),
    );
    expect(parsed.species[0]?.months[0]?.share).toBe(0.4);
    expect(parsed.species[0]?.months[1]?.share).toBeUndefined();
  });

  it("rejects a month outside 1-12", () => {
    expect(() =>
      SeasonalityYearResponseSchema.parse(
        validYearResponse({ species: [{ species: "orca", months: [{ month: 13, sampleSize: 10 }] }] }),
      ),
    ).toThrow();
  });
});
