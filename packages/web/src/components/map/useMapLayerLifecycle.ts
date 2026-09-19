import type { AddLayerObject, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

export interface UseMapLayerLifecycleOptions {
  sourceId: string;
  layers: AddLayerObject[];
}

/**
 * The shared skeleton behind `useGeoJsonMapLayer` and `useImageMapLayer`:
 * wait for the map's 'load' event, `apply(map, data)` once `data` is
 * available, and remove the source/layers only when the component
 * actually unmounts — never merely because `data` changed or briefly
 * became `undefined`.
 *
 * That last part is the whole reason this hook exists as a separate
 * effect split rather than one effect keyed on `[map, data]` that tears
 * down in its cleanup every time: an earlier version of both layer hooks
 * DID tear down on every `data` change, which was harmless while nothing
 * fed them a live-changing value — until R4 added `FilterBar`, and every
 * click blanked the whole sightings layer (all pins/clusters removed)
 * for the full round-trip of the refetch, because `result` transitioning
 * to `{state:"loading"}` (a new object, `data` becomes `undefined`) ran
 * the previous effect's cleanup before the new one's guard clause
 * no-op'd. Confirmed with a reproduction against the old implementation
 * before this fix. Now: nothing happens while there's no new `data` to
 * apply, so whatever was last successfully rendered stays on screen
 * (stale-while-revalidate) until a new `data` value actually arrives.
 *
 * `apply` is read through a ref, not put in the effect's own dependency
 * array — every caller reconstructs it (and`data`) fresh each render, but
 * only `data`'s identity should trigger a re-apply; capturing `apply` by
 * ref lets it always run the latest closure without also making every
 * unrelated render() call re-trigger the map work.
 */
export function useMapLayerLifecycle<T>(
  map: MapLibreMap | null,
  data: T | undefined,
  apply: (map: MapLibreMap, data: T) => void,
  { sourceId, layers }: UseMapLayerLifecycleOptions,
): void {
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  useEffect(() => {
    if (!map || data === undefined) return;

    const run = () => applyRef.current(map, data);

    if (map.loaded()) {
      run();
      return;
    }
    map.once("load", run);
    // `map.off(...)` returns `this` (MapLibre's chainable API) — wrapped
    // in a block so the arrow function returns `void`, not a `MapLibreMap`,
    // matching React's effect cleanup (`Destructor`) signature.
    return () => {
      map.off("load", run);
    };
  }, [map, data]);

  useEffect(() => {
    return () => {
      if (!map) return;
      for (const layer of layers) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      }
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceId/layers are stable module-level constants in every caller; this cleanup is meant to run only on unmount (map identity change) — see the doc comment above for why data must NOT be a dependency here
  }, [map]);
}
