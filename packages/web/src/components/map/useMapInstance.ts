import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MAP_BOUNDS, DEFAULT_MAP_FIT_OPTIONS, MAP_STYLE_URL } from "../../lib/mapConfig.js";

/**
 * Owns the MapLibre GL map's full lifecycle: construction against a
 * container element, standard controls, and teardown on unmount. This is
 * the one place in the app that imports `maplibre-gl` directly — every
 * layer feature (`features/probability`, `features/sightings`, ...) reads
 * `map` from this hook instead of touching the library itself.
 *
 * Takes a callback ref rather than an element/ref-object, so it also
 * works the render before the container div exists.
 */
export function useMapInstance() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!container) return;

    const instance = new MapLibreMap({
      container,
      style: MAP_STYLE_URL,
      bounds: DEFAULT_MAP_BOUNDS,
      fitBoundsOptions: DEFAULT_MAP_FIT_OPTIONS,
    });
    instance.addControl(new NavigationControl(), "top-right");

    // This is React's own documented shape for synchronizing with an
    // external system (https://react.dev/learn/synchronizing-with-effects):
    // construct the external instance in the effect, then expose it via
    // state so consumers re-render once it exists. There's no React state
    // driving this effect that could cascade — it re-runs only when
    // `container` (a DOM node) changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMap(instance);

    return () => {
      instance.remove();
      setMap(null);
    };
  }, [container]);

  const containerRef = useCallback((element: HTMLDivElement | null) => {
    setContainer(element);
  }, []);

  return { containerRef, map };
}
