import { describe, expect, it } from "vitest";
import { tierForPublisher } from "../../src/normalize/tier.js";

describe("tierForPublisher", () => {
  it("tiers OBIS-SEAMAP as research", () => {
    expect(tierForPublisher("67b2263f-6990-4d9d-b32b-20aa72ef4fbc")).toEqual({
      tier: "research",
      publisherName: "OBIS-SEAMAP",
    });
  });

  it("tiers iNaturalist.org as citizen", () => {
    expect(tierForPublisher("28eb1a3f-1c15-4a95-931a-4af90ecb574d")).toEqual({
      tier: "citizen",
      publisherName: "iNaturalist.org",
    });
  });

  it("tiers NOAA IOOS (SanctSound's publisher) as acoustic", () => {
    expect(tierForPublisher("1d38bb22-cbea-4845-8b0c-f62551076080")).toEqual({
      tier: "acoustic",
      publisherName: "NOAA Integrated Ocean Observing System",
    });
  });

  it("returns undefined for a publisher not on the allowlist — unknown publishers are dropped, never guessed at, per ADR 0002's tiering-by-publisher decision", () => {
    expect(tierForPublisher("00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });
});
