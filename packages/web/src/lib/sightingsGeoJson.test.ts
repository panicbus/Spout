import { describe, expect, it } from "vitest";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { sightingsToGeoJson } from "./sightingsGeoJson.js";

describe("sightingsToGeoJson", () => {
  it("converts each sighting into a Point feature carrying the fields paint expressions need", () => {
    const sighting = buildSighting({ id: "gbif:1", species: "orca", tier: "research" });

    const geojson = sightingsToGeoJson([sighting]);

    expect(geojson).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "gbif:1",
          geometry: { type: "Point", coordinates: [sighting.lon, sighting.lat] },
          properties: { id: "gbif:1", species: "orca", tier: "research" },
        },
      ],
    });
  });

  it("returns an empty FeatureCollection for no sightings", () => {
    expect(sightingsToGeoJson([])).toEqual({ type: "FeatureCollection", features: [] });
  });
});
