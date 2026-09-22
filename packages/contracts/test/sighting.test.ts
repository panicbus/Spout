import { describe, expect, it } from "vitest";
import { SightingSchema } from "../src/sighting.js";

const validAttribution = {
  datasetName: "Happywhale - Humpback whale in North Pacific Ocean",
  datasetId: "6cb6ab2b-b5ac-4134-9b25-574dcfcbef09",
  publisherName: "iNaturalist.org",
  publisherId: "28eb1a3f-1c15-4a95-931a-4af90ecb574d",
  license: { id: "CC0_1_0", commercialUse: true },
};

function validSighting(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "gbif:5994195745",
    species: "humpback-whale",
    lat: 36.794638,
    lon: -121.87099,
    observedAt: "2026-01-03T11:25:57.000Z",
    tier: "research",
    sourceApi: "gbif",
    verification: "verified",
    coordinatesObscured: false,
    attribution: validAttribution,
    ...overrides,
  };
}

describe("SightingSchema", () => {
  it("accepts a well-formed research sighting", () => {
    const sighting = SightingSchema.parse(validSighting());
    expect(sighting.species).toBe("humpback-whale");
  });

  it("rejects latitude outside +/-90 — a normalizer bug should fail loudly, not ship a broken pin", () => {
    expect(() => SightingSchema.parse(validSighting({ lat: 132 }))).toThrow();
  });

  it("rejects longitude outside +/-180", () => {
    expect(() => SightingSchema.parse(validSighting({ lon: -220 }))).toThrow();
  });

  it("rejects an unparseable observedAt", () => {
    expect(() => SightingSchema.parse(validSighting({ observedAt: "not-a-date" }))).toThrow();
  });

  it("rejects a sighting missing coordinatesObscured — obscured iNat coords must never be silently precise (ADR 0002)", () => {
    const { coordinatesObscured: _drop, ...withoutFlag } = validSighting();
    expect(() => SightingSchema.parse(withoutFlag)).toThrow();
  });

  it("accepts an optional positional uncertainty radius, e.g. GBIF's coordinateUncertaintyInMeters", () => {
    const sighting = SightingSchema.parse(
      validSighting({ positionalUncertaintyMeters: 1.11 }),
    );
    expect(sighting.positionalUncertaintyMeters).toBe(1.11);
  });

  it("rejects a negative positional uncertainty", () => {
    expect(() =>
      SightingSchema.parse(validSighting({ positionalUncertaintyMeters: -5 })),
    ).toThrow();
  });
});
