import type { AddLayerObject, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import type { FetchState } from "../../lib/useFetch.js";

export interface UseGeoJsonMapLayerOptions {
  sourceId: string;
  layers: AddLayerObject[];
  /** Extra GeoJSON source options beyond `type`/`data` — e.g. `{ cluster: true, clusterRadius: 50 }`. */
  sourceOptions?: Record<string, unknown>;
}

/**
 * The one place the "load-gated GeoJSON source + layers, update-in-place
 * on refetch, clean up on unmount" MapLibre lifecycle is implemented —
 * `ProbabilityLayer` and `SightingsLayer` both call this instead of each
 * hand-rolling their own copy (they used to; the two copies had already
 * drifted — one inlined a single layer id in its cleanup, the other had
 * generalized to a loop over three — before this was extracted).
 *
 * Takes the raw `FetchState<T>` and a `toGeoJson` transform, not an
 * already-computed `FeatureCollection`: computing the GeoJSON inside the
 * effect (keyed on `result`, not on a fresh object built every render)
 * is what keeps this from re-running on every unrelated re-render — a
 * `FeatureCollection` built fresh in the caller's render body would be a
 * new reference every time and defeat that.
 */
export function useGeoJsonMapLayer<T>(
  map: MapLibreMap | null,
  result: FetchState<T>,
  toGeoJson: (data: T) => FeatureCollection<Geometry>,
  { sourceId, layers, sourceOptions }: UseGeoJsonMapLayerOptions,
): void {
  useEffect(() => {
    if (!map || result.state !== "ok") return;

    const geojson = toGeoJson(result.data);

    const applyToMap = () => {
      const existingSource = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(geojson);
        return;
      }
      map.addSource(sourceId, { type: "geojson", data: geojson, ...sourceOptions });
      for (const layer of layers) map.addLayer(layer);
    };

    if (map.loaded()) {
      applyToMap();
    } else {
      map.once("load", applyToMap);
    }

    return () => {
      map.off("load", applyToMap);
      for (const layer of layers) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      }
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
    // toGeoJson/sourceId/layers/sourceOptions are expected to be stable
    // (module-level constants in every current caller) — only `map` and
    // `result` are meant to drive re-runs, matching the pre-extraction
    // behavior of both call sites this hook replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, result]);
}
