import type { Sighting, SourceTier, Species, VerificationStatus } from "@spout/contracts";
import type { FeatureCollection, Point } from "geojson";

export interface SightingProperties {
  id: string;
  species: Species;
  tier: SourceTier;
  verification: VerificationStatus;
  coordinatesObscured: boolean;
}

/**
 * Converts sightings into GeoJSON, carrying `species`/`tier` plus
 * `verification`/`coordinatesObscured` as properties so MapLibre paint
 * expressions can read them without a second lookup. `verification` and
 * `coordinatesObscured` are load-bearing, not decorative: spec.md and
 * ADR 0002 both require unverified citizen reports and geoprivacy-obscured
 * coordinates to read as visually distinct from a confirmed, precise
 * pin — `SightingsLayer`'s paint expressions key off these two
 * properties for exactly that (see its own doc comment). `id` is set at
 * both the GeoJSON Feature level and as a property: MapLibre's
 * clustering (Supercluster) works from geometry alone and does NOT
 * require the Feature-level id — that only matters for
 * `GeoJSONSource.updateData()`'s differential-update path and for
 * `setFeatureState`, neither of which `SightingsLayer` uses today (it
 * calls `setData()`, a full replace, on every refresh). Kept for that
 * future use rather than as a load-bearing clustering requirement; paint
 * expressions can't read the Feature-level id at all, hence the
 * property-level copy, which IS load-bearing (tier-based coloring).
 */
export function sightingsToGeoJson(sightings: Sighting[]): FeatureCollection<Point, SightingProperties> {
  return {
    type: "FeatureCollection",
    features: sightings.map((sighting) => ({
      type: "Feature",
      id: sighting.id,
      geometry: { type: "Point", coordinates: [sighting.lon, sighting.lat] },
      properties: {
        id: sighting.id,
        species: sighting.species,
        tier: sighting.tier,
        verification: sighting.verification,
        coordinatesObscured: sighting.coordinatesObscured,
      },
    })),
  };
}
