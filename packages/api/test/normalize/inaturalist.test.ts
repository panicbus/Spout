import { describe, expect, it } from "vitest";
import {
  normalizeINaturalistObservation,
  type INaturalistObservation,
} from "../../src/normalize/inaturalist.js";

function validObservation(overrides: Partial<INaturalistObservation> = {}): INaturalistObservation {
  return {
    id: 400855803,
    taxon: { name: "Megaptera novaeangliae kuzira" },
    quality_grade: "research",
    observed_on: "2026-09-16",
    time_observed_at: "2026-09-16T11:21:00-07:00",
    license_code: "cc-by-nc",
    obscured: false,
    location: "36.793208,-121.839678",
    public_positional_accuracy: 50,
    user: { login: "ak4708" },
    uri: "https://www.inaturalist.org/observations/400855803",
    ...overrides,
  };
}

describe("normalizeINaturalistObservation", () => {
  it("normalizes a well-formed research-grade observation into a schema-valid Sighting", () => {
    const sighting = normalizeINaturalistObservation(validObservation());

    expect(sighting).toMatchObject({
      id: "inaturalist:400855803",
      species: "humpback-whale", // matched via prefix, ignoring the subspecies suffix "kuzira"
      lat: 36.793208,
      lon: -121.839678,
      observedAt: "2026-09-16T11:21:00-07:00",
      tier: "citizen",
      sourceApi: "inaturalist",
      verification: "verified",
      coordinatesObscured: false,
      positionalUncertaintyMeters: 50,
    });
    expect(sighting?.attribution).toMatchObject({
      publisherName: "iNaturalist.org",
      license: { id: "CC_BY_NC_4_0", commercialUse: false },
      attributionUrl: "https://www.inaturalist.org/observations/400855803",
    });
  });

  it("sets attribution.datasetName to a plain 'Observation', not a redundant 'iNaturalist.org observations' (the card already says 'via iNaturalist.org')", () => {
    const sighting = normalizeINaturalistObservation(validObservation());
    expect(sighting?.attribution.datasetName).toBe("Observation");
  });

  it("upgrades the first photo's URL from iNaturalist's 75px 'square' thumbnail to a real detail-card-sized 'medium' image", () => {
    const sighting = normalizeINaturalistObservation(
      validObservation({
        photos: [{ url: "https://inaturalist-open-data.s3.amazonaws.com/photos/735666059/square.jpg" }],
      }),
    );
    expect(sighting?.photoUrl).toBe("https://inaturalist-open-data.s3.amazonaws.com/photos/735666059/medium.jpg");
  });

  it("leaves photoUrl undefined when the observation has no photos", () => {
    const sighting = normalizeINaturalistObservation(validObservation({ photos: undefined }));
    expect(sighting?.photoUrl).toBeUndefined();
  });

  it("maps quality_grade 'needs_id' to verification 'unverified'", () => {
    const sighting = normalizeINaturalistObservation(validObservation({ quality_grade: "needs_id" }));
    expect(sighting?.verification).toBe("unverified");
  });

  it("drops a 'casual' quality_grade observation entirely — no location/evidence requirement met, per ADR 0002's documented decision", () => {
    expect(normalizeINaturalistObservation(validObservation({ quality_grade: "casual" }))).toBeNull();
  });

  it("passes through the obscured flag directly — this is ground truth, unlike GBIF's inferred heuristic", () => {
    const sighting = normalizeINaturalistObservation(
      validObservation({ obscured: true, public_positional_accuracy: 22239 }),
    );
    expect(sighting?.coordinatesObscured).toBe(true);
  });

  it("drops an observation with no location", () => {
    expect(normalizeINaturalistObservation(validObservation({ location: null }))).toBeNull();
  });

  it("drops an observation with a malformed location missing one half, rather than coercing the empty component to 0 (Number(\"\") is 0, not NaN)", () => {
    expect(normalizeINaturalistObservation(validObservation({ location: "36.5," }))).toBeNull();
    expect(normalizeINaturalistObservation(validObservation({ location: ",-122.1" }))).toBeNull();
  });

  it("drops an observation whose species isn't one of the four Spout tracks", () => {
    expect(
      normalizeINaturalistObservation(validObservation({ taxon: { name: "Euphagus cyanocephalus" } })),
    ).toBeNull();
  });

  it("drops an observation with no taxon", () => {
    expect(normalizeINaturalistObservation(validObservation({ taxon: null }))).toBeNull();
  });

  it.each([
    ["cc0", "CC0_1_0", true],
    ["cc-by", "CC_BY_4_0", true],
    ["cc-by-sa", "CC_BY_SA_4_0", true],
    ["cc-by-nd", "CC_BY_ND_4_0", true],
    ["cc-by-nc", "CC_BY_NC_4_0", false],
    ["cc-by-nc-sa", "CC_BY_NC_SA_4_0", false],
    ["cc-by-nc-nd", "CC_BY_NC_ND_4_0", false],
  ] as const)("maps license_code %s to %s (commercialUse: %s)", (code, id, commercialUse) => {
    const sighting = normalizeINaturalistObservation(validObservation({ license_code: code }));
    expect(sighting?.attribution.license).toMatchObject({ id, commercialUse });
  });

  it("drops an observation with no license (null license_code = all rights reserved, not licensed for reuse)", () => {
    expect(normalizeINaturalistObservation(validObservation({ license_code: null }))).toBeNull();
  });

  it("prefers time_observed_at (has a real timezone offset) over observed_on (date-only) when both are present", () => {
    const sighting = normalizeINaturalistObservation(validObservation());
    expect(sighting?.observedAt).toBe("2026-09-16T11:21:00-07:00");
  });

  it("falls back to observed_on when time_observed_at is missing", () => {
    const sighting = normalizeINaturalistObservation(
      validObservation({ time_observed_at: null }),
    );
    expect(sighting?.observedAt).toBe("2026-09-16");
  });

  it("uses public_positional_accuracy, never the true positional_accuracy, so an obscured coordinate's real precision is never leaked", () => {
    const sighting = normalizeINaturalistObservation(
      validObservation({ public_positional_accuracy: 22239, positional_accuracy: 5 }),
    );
    expect(sighting?.positionalUncertaintyMeters).toBe(22239);
  });

  it("omits positionalUncertaintyMeters when not reported, rather than inventing a value", () => {
    const sighting = normalizeINaturalistObservation(
      validObservation({ public_positional_accuracy: null }),
    );
    expect(sighting?.positionalUncertaintyMeters).toBeUndefined();
  });
});
