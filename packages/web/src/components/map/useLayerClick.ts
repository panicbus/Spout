import type { Map as MapLibreMap, MapGeoJSONFeature, MapLayerMouseEvent } from "maplibre-gl";
import { useEffect } from "react";

/**
 * Fires `onFeatureClick` with the topmost feature under the pointer when a
 * layer-scoped click happens — the one place `PinDetailCard`'s
 * tap-to-detail interaction reaches into MapLibre's click event, so a
 * future second tappable layer reuses this instead of a second hand-rolled
 * listener. Registering `map.on("click", layerId, ...)` (not a plain
 * whole-map `"click"`) is safe to call before the layer itself exists —
 * MapLibre filters by layerId at dispatch time, not at registration time —
 * so this doesn't need to wait for the map's `'load'` event the way adding
 * a source/layer does.
 */
export function useLayerClick(
  map: MapLibreMap | null,
  layerId: string,
  onFeatureClick: (feature: MapGeoJSONFeature) => void,
): void {
  useEffect(() => {
    if (!map) return;

    const handleClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (feature) onFeatureClick(feature);
    };

    map.on("click", layerId, handleClick);
    return () => {
      map.off("click", layerId, handleClick);
    };
  }, [map, layerId, onFeatureClick]);
}
