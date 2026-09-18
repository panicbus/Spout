import { vi } from "vitest";

/**
 * Shared MapLibre mock — the ONE place `maplibre-gl` is faked for tests.
 * MapLibre needs a real WebGL context and throws when constructed in
 * jsdom, so every unit test that touches the map layer imports this
 * instead of hand-rolling its own mock. Registered globally in
 * `test/setup.ts`; individual tests import `mapInstances` to assert on
 * what was constructed. The real map is exercised once, for real, in
 * Playwright — see `e2e/`.
 */

export interface MapInstanceMock {
  options: Record<string, unknown>;
  remove: ReturnType<typeof vi.fn>;
  addControl: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

export const mapInstances: MapInstanceMock[] = [];

export function resetMaplibreMock(): void {
  mapInstances.length = 0;
}

class MapMock implements MapInstanceMock {
  options: Record<string, unknown>;
  remove: ReturnType<typeof vi.fn> = vi.fn();
  addControl: ReturnType<typeof vi.fn> = vi.fn();
  // `on`/`off` currently just record calls — nothing invokes the callback.
  // No production code calls `.on()` yet (useMapInstance doesn't need it).
  // The first feature layer that does (e.g. `map.on('load', cb)` to wait
  // for style-load before adding a source) MUST extend this mock to store
  // callbacks by event name and expose a `trigger(event)` helper, and its
  // test must call that helper — otherwise a test asserting only "on was
  // called" would pass while the callback body never runs in the unit
  // suite (see antagonist review, R0 waypoint).
  on: ReturnType<typeof vi.fn> = vi.fn();
  off: ReturnType<typeof vi.fn> = vi.fn();

  constructor(options: Record<string, unknown>) {
    this.options = options;
    mapInstances.push(this);
  }
}

class NavigationControlMock {}

export { MapMock as Map, NavigationControlMock as NavigationControl };
