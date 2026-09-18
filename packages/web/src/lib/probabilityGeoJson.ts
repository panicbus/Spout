import type { ProbabilityGrid } from "@spout/contracts";
import type { FeatureCollection, Point } from "geojson";

export interface ProbabilityCellProperties {
  probability: number;
}

/**
 * Converts the API's sparse cell list into a GeoJSON FeatureCollection:
 * one Point per cell, `probability` carried as a feature property so a
 * MapLibre layer's paint expression can read it. Layer-agnostic on
 * purpose — `ProbabilityLayer.tsx` currently feeds this into a `circle`
 * layer (see its own comment for why, after an earlier `heatmap` attempt
 * misrepresented the data), but nothing here assumes which layer type
 * consumes it. Pure and framework-free — no `map` needed to test this.
 *
 * Imports from `geojson` explicitly rather than relying on the ambient
 * `GeoJSON.*` global namespace: this package's `tsconfig.json` sets an
 * explicit `types` array, which (correctly) suppresses TypeScript's
 * default auto-inclusion of every `@types/*` package, `@types/geojson`
 * included — so the global namespace isn't reliably available here.
 */
export function gridToGeoJson(
  grid: ProbabilityGrid,
): FeatureCollection<Point, ProbabilityCellProperties> {
  return {
    type: "FeatureCollection",
    features: grid.cells.map((cell) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cell.lon, cell.lat] },
      properties: { probability: cell.probability },
    })),
  };
}
