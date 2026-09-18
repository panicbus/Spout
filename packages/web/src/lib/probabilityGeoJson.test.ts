import { describe, expect, it } from "vitest";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";
import { gridToGeoJson } from "./probabilityGeoJson.js";

describe("gridToGeoJson", () => {
  it("converts each cell into a Point feature with probability as a property, [lon, lat] order", () => {
    const grid = buildProbabilityGrid({
      cols: 2,
      cells: [
        { lat: 34.15, lon: -120.45, probability: 0.97 },
        { lat: 40.0, lon: -125.0, probability: 0.42 },
      ],
    });

    const geojson = gridToGeoJson(grid);

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(2);
    expect(geojson.features[0]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-120.45, 34.15] },
      properties: { probability: 0.97 },
    });
  });

  it("returns an empty FeatureCollection for a grid with no cells", () => {
    const geojson = gridToGeoJson(buildProbabilityGrid({ cells: [] }));
    expect(geojson.features).toEqual([]);
  });
});
