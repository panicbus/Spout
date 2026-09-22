import { describe, expect, it } from "vitest";
import { decodeSightingsQueryParams, encodeSightingsQuery } from "../src/sightingsQueryCodec.js";
import { SightingsQuerySchema } from "../src/filters.js";

describe("encodeSightingsQuery", () => {
  it("returns an empty string for no params", () => {
    expect(encodeSightingsQuery({})).toBe("");
  });

  it("serializes bbox/species/tier as comma-separated lists", () => {
    expect(encodeSightingsQuery({ bbox: [-126, 32, -117, 42] })).toBe("?bbox=-126%2C32%2C-117%2C42");
    expect(encodeSightingsQuery({ species: ["orca", "gray-whale"] })).toBe("?species=orca%2Cgray-whale");
    expect(encodeSightingsQuery({ tier: ["research", "citizen"] })).toBe("?tier=research%2Ccitizen");
  });

  it("serializes window and commercialOnly", () => {
    expect(encodeSightingsQuery({ window: "12m" })).toBe("?window=12m");
    expect(encodeSightingsQuery({ commercialOnly: true })).toBe("?commercialOnly=true");
  });

  it("combines multiple params", () => {
    expect(encodeSightingsQuery({ species: ["orca"], window: "90d" })).toBe(
      "?species=orca&window=90d",
    );
  });
});

describe("decodeSightingsQueryParams", () => {
  it("decodes an empty search into a raw object SightingsQuerySchema accepts, applying its defaults", () => {
    const raw = decodeSightingsQueryParams(new URLSearchParams());
    expect(SightingsQuerySchema.parse(raw)).toMatchObject({ window: "30d", commercialOnly: false });
  });

  it("round-trips encode -> decode -> the original values", () => {
    const original: { species: ("orca" | "gray-whale")[]; window: "12m"; commercialOnly: true } = {
      species: ["orca", "gray-whale"],
      window: "12m",
      commercialOnly: true,
    };
    const search = new URLSearchParams(encodeSightingsQuery(original).slice(1));
    const decoded = SightingsQuerySchema.parse(decodeSightingsQueryParams(search));
    expect(decoded).toMatchObject(original);
  });

  it("rejects an empty bbox segment (trailing comma) by producing NaN, which BboxSchema then rejects", () => {
    const raw = decodeSightingsQueryParams(new URLSearchParams("bbox=-126,32,-117,"));
    expect(() => SightingsQuerySchema.parse(raw)).toThrow();
  });

  it("throws directly on an unrecognized commercialOnly value, rather than silently resolving to false", () => {
    expect(() => decodeSightingsQueryParams(new URLSearchParams("commercialOnly=TRUE"))).toThrow();
  });
});
