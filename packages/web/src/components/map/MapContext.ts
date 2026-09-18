import type { Map as MapLibreMap } from "maplibre-gl";
import { createContext, useContext } from "react";

const MapContext = createContext<MapLibreMap | null>(null);

export const MapContextProvider = MapContext.Provider;

/**
 * How every feature layer (`ProbabilityLayer`, and R2/R3's
 * `SightingsLayer`/`CitizenLayer`) reaches the MapLibre instance —
 * `MapCanvas` is still the one place that constructs it (via
 * `useMapInstance`), this just avoids prop-drilling `map` through every
 * layer's props as more of them get added. Returns `null` before the map
 * has mounted; callers must handle that, not assume a map exists.
 */
export function useMap(): MapLibreMap | null {
  return useContext(MapContext);
}
