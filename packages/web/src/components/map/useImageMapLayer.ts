import type { AddLayerObject, ImageSource, Map as MapLibreMap } from "maplibre-gl";
import type { FetchState } from "../../lib/useFetch.js";
import { useMapLayerLifecycle } from "./useMapLayerLifecycle.js";

export interface ImageLayerSource {
  url: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
}

export interface UseImageMapLayerOptions {
  sourceId: string;
  layers: AddLayerObject[];
}

/**
 * The `image`-source specialization of `useMapLayerLifecycle` — adds via
 * `{type: "image", url, coordinates}` on first apply, updates an existing
 * source in place via `source.updateImage(...)` on every later apply
 * (MapLibre's `image` source doesn't have a `setData`-equivalent; this is
 * its update method). `ProbabilityLayer`'s raster rendering (R4) uses
 * this. See `useMapLayerLifecycle`'s doc comment for the shared
 * load-gating/stale-while-revalidate/cleanup-on-unmount behavior this and
 * `useGeoJsonMapLayer` both build on, rather than each re-implementing it.
 */
export function useImageMapLayer<T>(
  map: MapLibreMap | null,
  result: FetchState<T>,
  toImage: (data: T) => ImageLayerSource,
  { sourceId, layers }: UseImageMapLayerOptions,
): void {
  useMapLayerLifecycle(
    map,
    result.state === "ok" ? result.data : undefined,
    (map, data) => {
      const { url, coordinates } = toImage(data);
      const existingSource = map.getSource(sourceId) as ImageSource | undefined;
      if (existingSource) {
        existingSource.updateImage({ url, coordinates });
        return;
      }
      map.addSource(sourceId, { type: "image", url, coordinates });
      for (const layer of layers) map.addLayer(layer);
    },
    { sourceId, layers },
  );
}
