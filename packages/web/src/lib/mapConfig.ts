/**
 * OpenFreeMap's keyless "liberty" vector style — verified live (HTTP 200)
 * before adopting it. No API key, no usage-based billing at any traffic
 * level, unlike Mapbox GL JS's paid tiers past 50k loads/month.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Centers the initial view on the California coast bbox used by every API query: (-126,32)-(-117,42). */
export const DEFAULT_MAP_CENTER: [number, number] = [-121.5, 37];
export const DEFAULT_MAP_ZOOM = 5.4;
