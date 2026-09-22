import { describe, expect, it } from "vitest";
import { normalizeGbifRecord, type GbifOccurrence } from "../../src/normalize/sighting.js";

function validRecord(overrides: Partial<GbifOccurrence> = {}): GbifOccurrence {
  return {
    key: 5994195745,
    scientificName: "Megaptera novaeangliae (Borowski, 1781)",
    decimalLatitude: 36.794638,
    decimalLongitude: -121.87099,
    eventDate: "2026-01-03T11:25:57",
    datasetKey: "6cb6ab2b-b5ac-4134-9b25-574dcfcbef09",
    datasetName: "Happywhale - Humpback whale in North Pacific Ocean",
    publishingOrgKey: "28eb1a3f-1c15-4a95-931a-4af90ecb574d", // iNaturalist.org -> citizen
    license: "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
    coordinateUncertaintyInMeters: 1.11,
    ...overrides,
  };
}

describe("normalizeGbifRecord", () => {
  it("normalizes a well-formed record into a schema-valid Sighting", () => {
    const sighting = normalizeGbifRecord(validRecord());

    expect(sighting).toMatchObject({
      id: "gbif:5994195745",
      species: "humpback-whale",
      lat: 36.794638,
      lon: -121.87099,
      observedAt: "2026-01-03T11:25:57",
      tier: "citizen",
      sourceApi: "gbif",
      coordinatesObscured: false,
      positionalUncertaintyMeters: 1.11,
    });
    expect(sighting?.attribution).toMatchObject({
      datasetName: "Happywhale - Humpback whale in North Pacific Ocean",
      datasetId: "6cb6ab2b-b5ac-4134-9b25-574dcfcbef09",
      publisherName: "iNaturalist.org",
      publisherId: "28eb1a3f-1c15-4a95-931a-4af90ecb574d",
      license: { id: "CC0_1_0", commercialUse: true },
    });
  });

  it("pulls photoUrl from the Multimedia extension's first StillImage entry", () => {
    const sighting = normalizeGbifRecord(
      validRecord({
        media: [
          { type: "StillImage", identifier: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg" },
        ],
      }),
    );
    expect(sighting?.photoUrl).toBe("https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg");
  });

  it("leaves photoUrl undefined when there's no media, or no StillImage entry in it", () => {
    expect(normalizeGbifRecord(validRecord({ media: undefined }))?.photoUrl).toBeUndefined();
    expect(
      normalizeGbifRecord(validRecord({ media: [{ type: "Sound", identifier: "https://example.com/a.mp3" }] }))
        ?.photoUrl,
    ).toBeUndefined();
  });

  it("maps CC-BY-NC to commercialUse: false", () => {
    const sighting = normalizeGbifRecord(
      validRecord({ license: "http://creativecommons.org/licenses/by-nc/4.0/legalcode" }),
    );
    expect(sighting?.attribution.license).toEqual({
      id: "CC_BY_NC_4_0",
      url: "https://creativecommons.org/licenses/by-nc/4.0/legalcode",
      commercialUse: false,
    });
  });

  it("maps CC-BY to commercialUse: true", () => {
    const sighting = normalizeGbifRecord(
      validRecord({ license: "http://creativecommons.org/licenses/by/4.0/legalcode" }),
    );
    expect(sighting?.attribution.license).toEqual({
      id: "CC_BY_4_0",
      url: "https://creativecommons.org/licenses/by/4.0/legalcode",
      commercialUse: true,
    });
  });

  it("matches a license URL regardless of http/https scheme — GBIF is inconsistent about this even within one dataset (verified: fixtures/gbif/sample-page.json's own multimedia extension uses https for a dataset whose top-level license field uses http)", () => {
    const sighting = normalizeGbifRecord(
      validRecord({ license: "https://creativecommons.org/licenses/by/4.0/legalcode" }),
    );
    expect(sighting?.attribution.license.id).toBe("CC_BY_4_0");
  });

  it.each([
    ["https://creativecommons.org/licenses/by-sa/4.0/legalcode", "CC_BY_SA_4_0"],
    ["https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode", "CC_BY_NC_ND_4_0"],
  ])(
    "maps %s to %s — previously missing from this normalizer's own license map, unlike iNaturalist's (fixed via the shared ccLicenses.ts registry)",
    (url, expectedId) => {
      const sighting = normalizeGbifRecord(validRecord({ license: url }));
      expect(sighting?.attribution.license.id).toBe(expectedId);
    },
  );

  it("drops a record with an unrecognized license rather than guessing commercial use", () => {
    expect(normalizeGbifRecord(validRecord({ license: "https://example.com/some-other-license" }))).toBeNull();
  });

  it("drops a record with no license", () => {
    expect(normalizeGbifRecord(validRecord({ license: undefined }))).toBeNull();
  });

  it("drops a SanctSound record regardless of anything else about it", () => {
    expect(
      normalizeGbifRecord(
        validRecord({ datasetKey: "b3fc1d76-a50d-4a57-a2f3-425adfc59f9f", publishingOrgKey: "1d38bb22-cbea-4845-8b0c-f62551076080" }),
      ),
    ).toBeNull();
  });

  it("drops a record from a publisher not on the tiering allowlist", () => {
    expect(
      normalizeGbifRecord(validRecord({ publishingOrgKey: "00000000-0000-0000-0000-000000000000" })),
    ).toBeNull();
  });

  it("drops a record whose species isn't one of the four Spout tracks", () => {
    expect(normalizeGbifRecord(validRecord({ scientificName: "Balaenoptera physalus" }))).toBeNull();
  });

  it("drops a record with missing coordinates", () => {
    expect(
      normalizeGbifRecord(validRecord({ decimalLatitude: undefined, decimalLongitude: undefined })),
    ).toBeNull();
  });

  it("omits positionalUncertaintyMeters when GBIF doesn't report one, rather than inventing a value", () => {
    const sighting = normalizeGbifRecord(validRecord({ coordinateUncertaintyInMeters: undefined }));
    expect(sighting?.positionalUncertaintyMeters).toBeUndefined();
  });

  it("tiers a research-publisher record as verified", () => {
    const sighting = normalizeGbifRecord(
      validRecord({ publishingOrgKey: "67b2263f-6990-4d9d-b32b-20aa72ef4fbc" }), // OBIS-SEAMAP
    );
    expect(sighting?.tier).toBe("research");
    expect(sighting?.verification).toBe("verified");
  });

  it("tiers a citizen-publisher record as verified too — GBIF's only iNaturalist dataset in scope pre-filters to iNaturalist's own 'Research' quality grade before publishing (verified live against GBIF's dataset metadata), so 'unverified' would mislabel already-verified data", () => {
    const sighting = normalizeGbifRecord(validRecord()); // default publishingOrgKey is iNaturalist.org
    expect(sighting?.tier).toBe("citizen");
    expect(sighting?.verification).toBe("verified");
  });

  it("flags coordinatesObscured when uncertainty matches GBIF's known ~111km georeferencing-placeholder tell, instead of always reporting false", () => {
    const sighting = normalizeGbifRecord(validRecord({ coordinateUncertaintyInMeters: 111319.49 }));
    expect(sighting?.coordinatesObscured).toBe(true);
  });

  it("does not flag coordinatesObscured for a normal, small uncertainty value", () => {
    const sighting = normalizeGbifRecord(validRecord({ coordinateUncertaintyInMeters: 50 }));
    expect(sighting?.coordinatesObscured).toBe(false);
  });

  it("drops a record instead of throwing when it fails final schema validation — e.g. a Darwin Core eventDate interval like '1990-01-01/1990-06-30' (Date.parse returns NaN for these, and they are a real, documented GBIF format, not hypothetical)", () => {
    expect(() =>
      normalizeGbifRecord(validRecord({ eventDate: "1990-01-01/1990-06-30" })),
    ).not.toThrow();
    expect(normalizeGbifRecord(validRecord({ eventDate: "1990-01-01/1990-06-30" }))).toBeNull();
  });

  it("drops a record instead of throwing when coordinateUncertaintyInMeters is negative (fails the schema's nonnegative() check)", () => {
    expect(() =>
      normalizeGbifRecord(validRecord({ coordinateUncertaintyInMeters: -5 })),
    ).not.toThrow();
    expect(normalizeGbifRecord(validRecord({ coordinateUncertaintyInMeters: -5 }))).toBeNull();
  });

  describe("iNaturalist-dataset de-dup convergence (R3)", () => {
    // GBIF's "iNaturalist Research-grade Observations" dataset (verified
    // live) — the only GBIF dataset whose occurrenceID reliably embeds
    // the same numeric id iNaturalist's own direct API uses for the same
    // observation.
    const INATURALIST_DATASET_KEY = "50c9509d-22c7-4a22-a47d-8c48425ef4a7";

    it("re-ids a record from GBIF's iNaturalist dataset to inaturalist:<id>, matching what R3's direct iNaturalist fetch would produce for the same observation, so the store's upsert-by-id naturally deduplicates them", () => {
      const sighting = normalizeGbifRecord(
        validRecord({
          key: 5938027305,
          datasetKey: INATURALIST_DATASET_KEY,
          occurrenceID: "https://www.inaturalist.org/observations/333069440",
        }),
      );

      expect(sighting?.id).toBe("inaturalist:333069440");
      expect(sighting?.sourceApi).toBe("inaturalist");
    });

    it("falls back to gbif:<key> when the iNaturalist dataset's occurrenceID doesn't match the expected observation-URL shape", () => {
      const sighting = normalizeGbifRecord(
        validRecord({
          key: 5938027305,
          datasetKey: INATURALIST_DATASET_KEY,
          occurrenceID: "not-a-url",
        }),
      );

      expect(sighting?.id).toBe("gbif:5938027305");
      expect(sighting?.sourceApi).toBe("gbif");
    });

    it("accepts http as well as https in the observation URL (occurrenceID scheme, like the license URL, is not reliably https-only)", () => {
      const sighting = normalizeGbifRecord(
        validRecord({
          key: 5938027305,
          datasetKey: INATURALIST_DATASET_KEY,
          occurrenceID: "http://www.inaturalist.org/observations/333069440",
        }),
      );

      expect(sighting?.id).toBe("inaturalist:333069440");
    });

    it.each([
      ["a trailing slash", "https://www.inaturalist.org/observations/333069440/"],
      ["no www subdomain", "https://inaturalist.org/observations/333069440"],
    ])(
      "falls back to gbif:<key> for a near-miss occurrenceID shape (%s) — verified live against 350+ real records that this shape never actually occurs, so the fallback (not a data-loss risk) is the only behavior this covers",
      (_label, occurrenceID) => {
        const sighting = normalizeGbifRecord(
          validRecord({ key: 5938027305, datasetKey: INATURALIST_DATASET_KEY, occurrenceID }),
        );

        expect(sighting?.id).toBe("gbif:5938027305");
        expect(sighting?.sourceApi).toBe("gbif");
      },
    );

    it("falls back to gbif:<key> when occurrenceID is absent entirely", () => {
      const sighting = normalizeGbifRecord(
        validRecord({ key: 5938027305, datasetKey: INATURALIST_DATASET_KEY, occurrenceID: undefined }),
      );

      expect(sighting?.id).toBe("gbif:5938027305");
    });

    it("does not remap a record from a different dataset, even if it's iNaturalist-published with an inaturalist.org occurrenceID (e.g. Happywhale-via-iNaturalist) — only this one specific dataset is known to have this exact correspondence", () => {
      const sighting = normalizeGbifRecord(
        validRecord({
          key: 5994195745,
          datasetKey: "6cb6ab2b-b5ac-4134-9b25-574dcfcbef09", // Happywhale, not the iNat dataset
          occurrenceID: "https://www.inaturalist.org/observations/333069440",
        }),
      );

      expect(sighting?.id).toBe("gbif:5994195745");
      expect(sighting?.sourceApi).toBe("gbif");
    });
  });
});
