import { describe, expect, it } from "vitest";
import { AttributionSchema, LicenseSchema, SourceApiSchema, SourceTierSchema } from "../src/source.js";

describe("SourceTierSchema", () => {
  it("rejects an unknown tier — tiering must stay a closed set", () => {
    expect(() => SourceTierSchema.parse("confirmed")).toThrow();
  });
});

describe("SourceApiSchema", () => {
  it("rejects OBIS — dropped per ADR 0002", () => {
    expect(() => SourceApiSchema.parse("obis")).toThrow();
  });
});

describe("LicenseSchema", () => {
  it("accepts a non-commercial license marked commercialUse: false", () => {
    const license = LicenseSchema.parse({
      id: "CC_BY_NC_4_0",
      url: "https://creativecommons.org/licenses/by-nc/4.0/",
      commercialUse: false,
    });
    expect(license.commercialUse).toBe(false);
  });

  it("requires commercialUse to be present — it must never be inferred silently downstream", () => {
    expect(() =>
      LicenseSchema.parse({ id: "CC0_1_0", url: "https://creativecommons.org/publicdomain/zero/1.0/" }),
    ).toThrow();
  });
});

describe("AttributionSchema", () => {
  it("accepts a full attribution record with a nested license", () => {
    const attribution = AttributionSchema.parse({
      datasetName: "Happywhale - Humpback whale in North Pacific Ocean",
      datasetId: "6cb6ab2b-b5ac-4134-9b25-574dcfcbef09",
      publisherName: "iNaturalist.org",
      publisherId: "28eb1a3f-1c15-4a95-931a-4af90ecb574d",
      license: { id: "CC0_1_0", commercialUse: true },
    });
    expect(attribution.license.commercialUse).toBe(true);
  });

  it("rejects an attribution missing a license — every record must carry one per ADR 0003", () => {
    expect(() =>
      AttributionSchema.parse({
        datasetName: "Some dataset",
        datasetId: "abc",
        publisherName: "Someone",
        publisherId: "def",
      }),
    ).toThrow();
  });
});
