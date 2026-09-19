import { describe, expect, it } from "vitest";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { sightingsToGeoJson } from "./sightingsGeoJson.js";

const NOW = new Date("2026-09-19T12:00:00.000Z");

describe("sightingsToGeoJson", () => {
  it("converts each sighting into a Point feature carrying the fields paint expressions need", () => {
    const sighting = buildSighting({
      id: "gbif:1",
      species: "orca",
      tier: "research",
      verification: "verified",
      coordinatesObscured: false,
      observedAt: "2026-09-19T06:00:00.000Z",
    });

    const geojson = sightingsToGeoJson([sighting], NOW);

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
            ageBucket: "today",
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
      observedAt: "2026-08-01T00:00:00.000Z",
    });

    const geojson = sightingsToGeoJson([sighting], NOW);

    expect(geojson.features[0]?.properties).toEqual({
      id: "inaturalist:1",
      species: sighting.species,
      tier: "citizen",
      verification: "unverified",
      coordinatesObscured: true,
      ageBucket: "older",
    });
  });

  it("computes ageBucket per sighting from observedAt, so older reports can render faded independent of verification status", () => {
    const sightings = [
      buildSighting({ id: "a", observedAt: "2026-09-19T06:00:00.000Z" }),
      buildSighting({ id: "b", observedAt: "2026-09-05T00:00:00.000Z" }),
      buildSighting({ id: "c", observedAt: "2026-08-01T00:00:00.000Z" }),
    ];

    const geojson = sightingsToGeoJson(sightings, NOW);

    expect(geojson.features.map((f) => f.properties.ageBucket)).toEqual([
      "today",
      "this-month",
      "older",
    ]);
  });

  it("returns an empty FeatureCollection for no sightings", () => {
    expect(sightingsToGeoJson([])).toEqual({ type: "FeatureCollection", features: [] });
  });
});
