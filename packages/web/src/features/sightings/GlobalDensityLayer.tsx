import type { AddLayerObject } from "maplibre-gl";
import { useMap } from "../../components/map/MapContext.js";
import { useMapLayerLifecycle } from "../../components/map/useMapLayerLifecycle.js";
import { SIGHTINGS_CLUSTERS_LAYER_ID } from "./SightingsLayer.js";

const GLOBAL_DENSITY_SOURCE_ID = "gbif-density";
const GLOBAL_DENSITY_LAYER_ID = "gbif-density-tiles";

/**
 * GBIF's own precomputed occurrence-density tiles (verified live: HTTP
 * 200, a real small PNG) — chosen specifically so a zoomed-out global
 * view has *some* visual sense of "reports exist here" without shipping
 * raw points for the whole world, which Phase 2's on-demand
 * `GlobalSightingsCache` deliberately avoids doing per-request (see its
 * doc comment). `taxonKey=733` is the whole order Cetacea, not any one
 * tracked species — this is background context for "where do whale
 * reports cluster," not a species-specific claim.
 *
 * A plain `raster` source, not `useImageMapLayer`'s data-fetch pipeline:
 * these are just static, publicly-tiled images MapLibre can request
 * directly by z/x/y, no data to fetch/decode/re-apply on this app's own
 * side at all — `useMapLayerLifecycle` is reused here purely for its
 * wait-for-'load'/unmount-teardown behavior, with a constant sentinel
 * `data` value (`1`, never changing) standing in for "there's nothing to
 * wait on, just add this once the map exists."
 */
const densityLayer: AddLayerObject = {
  id: GLOBAL_DENSITY_LAYER_ID,
  type: "raster",
  source: GLOBAL_DENSITY_SOURCE_ID,
  paint: { "raster-opacity": 0.5 },
  // Fades out once the user is zoomed in enough that SightingsLayer's
  // own clusters/points are the more precise, more honest thing to show
  // — this is coarse background texture, not meant to compete with real
  // per-report pins at a scale where those are legible.
  maxzoom: 6,
};

export function GlobalDensityLayer() {
  const map = useMap();

  useMapLayerLifecycle(
    map,
    1,
    (map) => {
      map.addSource(GLOBAL_DENSITY_SOURCE_ID, {
        type: "raster",
        tiles: ["https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?taxonKey=733&style=classic.poly"],
        tileSize: 512,
      });
      // Below the sightings layer's own clusters — this is background
      // texture, sightings pins/clusters must stay on top and clickable.
      // Real MapLibre throws `addLayer(layer, beforeId)` outright for a
      // beforeId that doesn't exist yet on the map (a real race: whoever
      // resolves last wins the natural top slot instead) — same guard
      // `useImageMapLayer` already uses for this same race.
      if (map.getLayer(SIGHTINGS_CLUSTERS_LAYER_ID)) {
        map.addLayer(densityLayer, SIGHTINGS_CLUSTERS_LAYER_ID);
      } else {
        map.addLayer(densityLayer);
      }
    },
    { sourceId: GLOBAL_DENSITY_SOURCE_ID, layers: [densityLayer] },
  );

  return null;
}
