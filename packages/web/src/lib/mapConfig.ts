import { CA_COAST_BBOX } from "@spout/contracts";

/**
 * OpenFreeMap's keyless "liberty" vector style — verified live (HTTP 200)
 * before adopting it. No API key, no usage-based billing at any traffic
 * level, unlike Mapbox GL JS's paid tiers past 50k loads/month.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

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
/** Leaves a little room so the bbox's own edges aren't flush against the screen/UI chrome, and keeps fitBounds from zooming in uncomfortably close on a narrow/tall viewport. */
export const DEFAULT_MAP_FIT_OPTIONS = { padding: 32, maxZoom: 8 };
