import { describe, expect, it } from "vitest";
import { SPECIES, SPECIES_LABELS, SpeciesSchema } from "../src/species.js";

describe("SpeciesSchema", () => {
  it("accepts each of the four v1 target species", () => {
    for (const species of SPECIES) {
      expect(SpeciesSchema.parse(species)).toBe(species);
    }
  });

  it("rejects a species outside the v1 set", () => {
    expect(() => SpeciesSchema.parse("fin-whale")).toThrow();
  });

  it("has a human-readable label for every species in the enum", () => {
    for (const species of SPECIES) {
      expect(SPECIES_LABELS[species]).toBeTruthy();
    }
  });
});
