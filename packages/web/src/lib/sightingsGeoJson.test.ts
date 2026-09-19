import { describe, expect, it } from "vitest";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { sightingsToGeoJson } from "./sightingsGeoJson.js";

describe("sightingsToGeoJson", () => {
  it("converts each sighting into a Point feature carrying the fields paint expressions need", () => {
    const sighting = buildSighting({
      id: "gbif:1",
      species: "orca",
      tier: "research",
      verification: "verified",
      coordinatesObscured: false,
    });

    const geojson = sightingsToGeoJson([sighting]);

    expect(geojson).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "gbif:1",
          geometry: { type: "Point", coordinates: [sighting.lon, sighting.lat] },
          properties: {
            id: "gbif:1",
            species: "orca",
            tier: "research",
            verification: "verified",
            coordinatesObscured: false,
          },
        },
      ],
    });
  });

  it("carries unverified and obscured-coordinate flags through, so the map can distinguish them (spec.md / ADR 0002: citizen reports must be marked unverified, obscured coordinates must never render as precise pins)", () => {
    const sighting = buildSighting({
      id: "inaturalist:1",
      tier: "citizen",
      verification: "unverified",
      coordinatesObscured: true,
    });

    const geojson = sightingsToGeoJson([sighting]);

    expect(geojson.features[0]?.properties).toEqual({
      id: "inaturalist:1",
      species: sighting.species,
      tier: "citizen",
      verification: "unverified",
      coordinatesObscured: true,
    });
  });

  it("returns an empty FeatureCollection for no sightings", () => {
    expect(sightingsToGeoJson([])).toEqual({ type: "FeatureCollection", features: [] });
  });
});
