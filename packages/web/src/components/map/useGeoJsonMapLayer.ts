import type { AddLayerObject, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import type { FetchState } from "../../lib/useFetch.js";
import { useMapLayerLifecycle } from "./useMapLayerLifecycle.js";

export interface UseGeoJsonMapLayerOptions {
  sourceId: string;
  layers: AddLayerObject[];
  /** Extra GeoJSON source options beyond `type`/`data` — e.g. `{ cluster: true, clusterRadius: 50 }`. */
  sourceOptions?: Record<string, unknown>;
}

/**
 * The GeoJSON-source specialization of `useMapLayerLifecycle` — adds via
 * `{type: "geojson", data, ...sourceOptions}` on first apply, updates an
 * existing source in place via `setData(...)` on every later apply.
 * `ProbabilityLayer` and `SightingsLayer` both call this instead of each
 * hand-rolling their own copy (see `useMapLayerLifecycle`'s doc comment
 * for the shared lifecycle both this and `useImageMapLayer` build on).
 *
 * Takes the raw `FetchState<T>` and a `toGeoJson` transform, not an
 * already-computed `FeatureCollection`: computing the GeoJSON only when
 * `result` itself changes (not on every unrelated re-render) is what
 * keeps a fresh-object-per-render `toGeoJson` call from defeating the
 * shared hook's re-apply-only-on-real-change behavior.
 */
export function useGeoJsonMapLayer<T>(
  map: MapLibreMap | null,
  result: FetchState<T>,
  toGeoJson: (data: T) => FeatureCollection<Geometry>,
  { sourceId, layers, sourceOptions }: UseGeoJsonMapLayerOptions,
): void {
  useMapLayerLifecycle(
    map,
    result.state === "ok" ? result.data : undefined,
    (map, data) => {
      const geojson = toGeoJson(data);
      const existingSource = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(geojson);
        return;
      }
      map.addSource(sourceId, { type: "geojson", data: geojson, ...sourceOptions });
      for (const layer of layers) map.addLayer(layer);
    },
    { sourceId, layers },
  );
}
