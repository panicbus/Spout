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
  /**
   * If given AND currently present on the map, each of `layers` is
   * inserted directly below it instead of at the very top of the stack.
   * Exists so this layer's stacking position doesn't depend on which of
   * two independent async fetches (this one vs. whatever `beforeId`
   * belongs to) happens to resolve first — without this, `ProbabilityLayer`
   * and `SightingsLayer` raced to `addLayer`, and whichever's data arrived
   * later ended up drawn (and effectively hit-tested) on top, sometimes
   * burying the sighting pins under the probability raster. Falls back to
   * MapLibre's default (added at the top) when `beforeId` isn't present
   * yet — safe because MapLibre throws if you pass a `beforeId` that
   * doesn't exist on the map.
   */
  beforeId?: string;
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
  { sourceId, layers, beforeId }: UseImageMapLayerOptions,
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
      for (const layer of layers) {
        if (beforeId && map.getLayer(beforeId)) {
          map.addLayer(layer, beforeId);
        } else {
          map.addLayer(layer);
        }
      }
    },
    { sourceId, layers },
  );
}
