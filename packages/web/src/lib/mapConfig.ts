import { CA_COAST_BBOX } from "@spout/contracts";

/**
 * OpenFreeMap's keyless "liberty" vector style — verified live (HTTP 200)
 * before adopting it. No API key, no usage-based billing at any traffic
 * level, unlike Mapbox GL JS's paid tiers past 50k loads/month.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const [minLon, minLat, maxLon, maxLat] = CA_COAST_BBOX;

/** Centers the initial view on the midpoint of `CA_COAST_BBOX` — the same bbox every API query is scoped to, defined once in `@spout/contracts`. */
export const DEFAULT_MAP_CENTER: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
export const DEFAULT_MAP_ZOOM = 5.4;
