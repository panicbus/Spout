import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";

export interface ProjectedPoint {
  x: number;
  y: number;
}

/**
 * The screen-space pixel position of a map coordinate, kept live as the
 * map pans/zooms/rotates — what `AnchoredCard` needs to stay visually
 * pinned to the feature that opened it. `lngLat` is `null` when nothing
 * should be tracked (nothing selected); passing a new `[lng, lat]` tuple
 * re-subscribes and re-projects immediately rather than waiting for the
 * next map movement.
 */
export function useProjectedPoint(map: MapLibreMap | null, lngLat: [number, number] | null): ProjectedPoint | null {
  const [point, setPoint] = useState<ProjectedPoint | null>(null);
  // Depend on the two primitive numbers, not `lngLat`'s array identity —
  // a caller that (reasonably) passes a fresh `[lng, lat]` literal each
  // render, rather than threading a memoized tuple through, would
  // otherwise re-run this effect every render: the effect calls
  // `setPoint` with a new object every time (`map.project` doesn't
  // return a cached value), which schedules another render, which
  // creates another new `lngLat` array, which re-triggers the effect —
  // an infinite loop with no thrown error, just a runaway render cycle.
  const lng = lngLat?.[0];
  const lat = lngLat?.[1];
  const shouldTrack = map !== null && lng !== undefined && lat !== undefined;

  // Reset during render (not via a synchronous setState-in-effect —
  // this project's lint config forbids that for derived state; see
  // SightingsLayer.tsx's `lastData` for the same pattern) whenever
  // there's nothing left to track.
  if (!shouldTrack && point !== null) {
    setPoint(null);
  }

  useEffect(() => {
    if (!map || lng === undefined || lat === undefined) return;

    const update = () => setPoint(map.project([lng, lat]));
    update();

    map.on("move", update);
    return () => {
      map.off("move", update);
    };
  }, [map, lng, lat]);

  return point;
}
