import { describe, expect, it } from "vitest";
import { SPECIES } from "@spout/contracts";
import { seasonalityNote } from "./seasonality.js";

describe("seasonalityNote", () => {
  it("returns a real note for gray whales (seasonally absent from CA outside their migration window, per ADR 0002)", () => {
    const note = seasonalityNote("gray-whale");
    expect(note).toBeTruthy();
    expect(note).toMatch(/migrat/i);
  });

  it("returns undefined for a species with no documented seasonality caveat", () => {
    expect(seasonalityNote("orca")).toBeUndefined();
  });

  it("has a note only for species that actually need one — not every SPECIES entry", () => {
    const withNotes = SPECIES.filter((species) => seasonalityNote(species) !== undefined);
    expect(withNotes).toEqual(["gray-whale"]);
  });
});
