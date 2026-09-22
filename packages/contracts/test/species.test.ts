import { describe, expect, it } from "vitest";
import {
  SPECIES,
  SPECIES_LABELS,
  SPECIES_SCIENTIFIC_NAMES,
  SpeciesSchema,
  speciesFromScientificName,
} from "../src/species.js";

describe("SpeciesSchema", () => {
  it("rejects a species outside the v1 set", () => {
    expect(() => SpeciesSchema.parse("fin-whale")).toThrow();
  });

  it("has a human-readable label for every species in the enum", () => {
    for (const species of SPECIES) {
      expect(SPECIES_LABELS[species]).toBeTruthy();
    }
  });

  it("has a scientific name for every species — shared by both GBIF and iNaturalist source modules", () => {
    for (const species of SPECIES) {
      expect(SPECIES_SCIENTIFIC_NAMES[species]).toBeTruthy();
    }
  });
});

describe("speciesFromScientificName", () => {
  it("matches GBIF's authored form, e.g. 'Megaptera novaeangliae (Borowski, 1781)'", () => {
    expect(speciesFromScientificName("Megaptera novaeangliae (Borowski, 1781)")).toBe(
      "humpback-whale",
    );
  });

  it("matches a bare scientific name with no author suffix", () => {
    expect(speciesFromScientificName("Balaenoptera musculus")).toBe("blue-whale");
  });

  it("returns undefined for a species this app doesn't track", () => {
    expect(speciesFromScientificName("Balaenoptera physalus")).toBeUndefined();
  });
});
