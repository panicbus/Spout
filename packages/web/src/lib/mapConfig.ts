import { CA_COAST_BBOX } from "@spout/contracts";
import type { StyleSpecification } from "maplibre-gl";

/**
 * Esri's "World Ocean Base" — a marine-focused basemap (bathymetric
 * shaded relief at sea, cartographic shaded relief on land), sourced
 * from GEBCO/NOAA NGDC/Esri/Garmin. This is the same tile service the
 * user's reference (pacificwhale.org's whale/dolphin tracker) actually
 * uses — confirmed by inspecting its own live network requests, not
 * guessed from how it looks. Verified live (HTTP 200, real JPEG tiles,
 * `Access-Control-Allow-Origin: *`, no API key/token required) before
 * adopting it — this is Esri's older, still-public tile endpoint
 * (`server.arcgisonline.com`), distinct from their newer
 * `ibasemaps-api.arcgis.com` service which does require a token; if
 * Esri ever retires this free endpoint, that's the paid-token
 * alternative to switch to, not a sign this URL was wrong. 17 zoom
 * levels (0-16), global coverage; MapLibre oversamples the z16 tile
 * past that natively, same as any other raster basemap.
 */
const ESRI_OCEAN_BASEMAP_SOURCE_ID = "esri-ocean-basemap";

/**
 * The one fill layer representing real water bodies (ocean/lake/river —
 * OpenMapTiles merges these under one schema) — carried over from
 * OpenFreeMap's "liberty" style's own `water` layer/source-layer
 * (verified live against that style's JSON) but re-declared here with
 * `fill-opacity: 0`: the Esri raster above already provides the visible
 * basemap, so this layer exists purely so `queryRenderedFeatures` can
 * still answer "is this tap on water" (see `SightingsLayer.tsx`'s
 * `BASEMAP_WATER_LAYER_ID`) — an invisible layer's geometry is still
 * queryable in MapLibre, only its paint is suppressed. Deliberately NOT
 * a "no land layer hit" check instead: OpenMapTiles has no single
 * comprehensive land polygon (landcover/landuse only cover specific
 * classified land-use types), so a land-absence check would misclassify
 * real land as water.
 */
const OPENMAPTILES_SOURCE_ID = "openmaptiles";

/**
 * A minimal, hand-composed MapLibre style (not an external style.json
 * URL) — deliberately not OpenFreeMap's full "liberty" style plus an
 * Esri layer stacked on top: layering a second full basemap under an
 * opaque vector style's own land/water rendering would just hide the
 * Esri imagery entirely. Two sources only: the visible Esri raster, and
 * OpenFreeMap's vector tiles kept around solely for the invisible water
 * hit-test layer above — no glyphs/sprite needed since nothing here
 * renders text or icons from it.
 */
export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    [ESRI_OCEAN_BASEMAP_SOURCE_ID]: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Esri, Garmin, GEBCO, NOAA NGDC, and other contributors",
    },
    [OPENMAPTILES_SOURCE_ID]: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: ESRI_OCEAN_BASEMAP_SOURCE_ID,
      type: "raster",
      source: ESRI_OCEAN_BASEMAP_SOURCE_ID,
    },
    {
      id: "water",
      type: "fill",
      source: OPENMAPTILES_SOURCE_ID,
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: { "fill-opacity": 0 },
    },
  ],
};

/**
 * Esri's World Ocean Base tiles bake roads and administrative boundary
 * lines directly into the raster image itself once zoomed in this far —
 * there's no vector layer to toggle them off, since it's a flat image.
 * Verified live at multiple real coastal/inland tiles: z7 is clean
 * everywhere sampled (including land-heavy areas, not just open ocean);
 * z8 already shows a real road in a land-heavy East Bay tile. Capping
 * the map's own interactive zoom here (not just the initial fit below)
 * trades away zooming into a specific harbor/marina at close range for
 * a guarantee that roads/boundaries never appear — a deliberate choice
 * over switching to a road-free-at-any-zoom basemap (`World_Terrain_Base`),
 * whose own ocean rendering is flatter/more color-banded than the rich
 * shaded-relief texture this app wants (also verified live, tile by
 * tile, before deciding).
 */
export const MAX_MAP_ZOOM = 7;

/**
 * The initial camera fits itself to this bbox (`CA_COAST_BBOX` — the same
 * one every API query is scoped to) rather than using a fixed center +
 * zoom number. A fixed zoom is tied to one specific viewport width: 5.4
 * was tuned against a narrow phone-width screen, where it frames the
 * coast well — on a normal wide desktop window, that same zoom shows
 * roughly 40°+ of longitude, so the actual coastal strip (9° wide)
 * shrinks to a sliver next to Nevada/Utah/Arizona and looks like an
 * empty map. `fitBounds` (passed to the constructor below) computes the
 * zoom the CURRENT container's real pixel dimensions need to contain
 * this bbox, so it's correct on a phone and a desktop window alike.
 */
export const DEFAULT_MAP_BOUNDS = CA_COAST_BBOX;
/** Leaves a little room so the bbox's own edges aren't flush against the screen/UI chrome, and keeps fitBounds from zooming in uncomfortably close on a narrow/tall viewport. Capped at the same `MAX_MAP_ZOOM`, not a separate number, so the initial view can never itself land past where the hard interactive cap would immediately snap it back from. */
export const DEFAULT_MAP_FIT_OPTIONS = { padding: 32, maxZoom: MAX_MAP_ZOOM };
