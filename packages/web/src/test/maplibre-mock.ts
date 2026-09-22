import { vi } from "vitest";

/**
 * Shared MapLibre mock — the ONE place `maplibre-gl` is faked for tests.
 * MapLibre needs a real WebGL context and throws when constructed in
 * jsdom, so every unit test that touches the map layer imports this
 * instead of hand-rolling its own mock. Registered globally in
 * `test/setup.ts`; individual tests import `mapInstances` to assert on
 * what was constructed. The real map is exercised once, for real, in
 * Playwright — see `e2e/`.
 *
 * `on`/`once`/`off` are backed by a real listener registry and `trigger()`
 * actually invokes the stored callbacks — not just `vi.fn()`s that record
 * a call and do nothing. A mock where `on` was inert would let a test
 * assert "on('load', cb) was called" while `cb`'s body (the real feature
 * logic) never runs in the unit suite; `loaded()` starts `false` so a
 * layer that forgets to wait for 'load' before calling `addSource` is
 * exercised realistically, not against an always-ready map.
 */

type Listener = (...args: unknown[]) => void;
/** Real maplibre-gl's `on`/`once`/`off` overload for a layer-scoped event (e.g. `map.on("click", "my-layer", handler)`), alongside the plain whole-map form. */
type EventBinder = (event: string, layerIdOrCb: string | Listener, cb?: Listener) => unknown;

export interface MapInstanceMock {
  options: Record<string, unknown>;
  remove: ReturnType<typeof vi.fn>;
  addControl: ReturnType<typeof vi.fn>;
  addSource: ReturnType<typeof vi.fn>;
  removeSource: ReturnType<typeof vi.fn>;
  getSource: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  removeLayer: ReturnType<typeof vi.fn>;
  getLayer: ReturnType<typeof vi.fn>;
  /** Defaults to `{x: 0, y: 0}` — override per test via `mockReturnValue`/`mockImplementation` when a test cares about the actual projected pixel. */
  project: ReturnType<typeof vi.fn>;
  /** Defaults to a detached `<div>` — its `getBoundingClientRect()` is all-zero under jsdom, like any unattached/unrendered element; override with `mockReturnValue({ getBoundingClientRect: () => ({...}) })` when a test needs a real container size. */
  getContainer: ReturnType<typeof vi.fn>;
  /** Defaults to `{lng: 0, lat: 0}` — override per test when a test cares about the actual unprojected coordinate. */
  unproject: ReturnType<typeof vi.fn>;
  /** Defaults to `[]` (nothing hit) — override per test to simulate a click landing on a real feature. */
  queryRenderedFeatures: ReturnType<typeof vi.fn>;
  easeTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn<EventBinder>>;
  once: ReturnType<typeof vi.fn<EventBinder>>;
  off: ReturnType<typeof vi.fn<EventBinder>>;
  loaded: ReturnType<typeof vi.fn>;
  /** Test-only: invokes every whole-map (non-layer-scoped) callback registered for `event`, as the real event would. */
  trigger: (event: string, ...args: unknown[]) => void;
  /** Test-only: invokes every callback registered for `event` scoped to exactly `layerId`, as a real feature click/hover event would. */
  triggerLayerEvent: (event: string, layerId: string, ...args: unknown[]) => void;
}

export const mapInstances: MapInstanceMock[] = [];

export function resetMaplibreMock(): void {
  mapInstances.length = 0;
}

class MapMock implements MapInstanceMock {
  options: Record<string, unknown>;
  remove: ReturnType<typeof vi.fn> = vi.fn();
  addControl: ReturnType<typeof vi.fn> = vi.fn();
  addSource: ReturnType<typeof vi.fn> = vi.fn();
  removeSource: ReturnType<typeof vi.fn> = vi.fn();
  getSource: ReturnType<typeof vi.fn> = vi.fn();
  addLayer: ReturnType<typeof vi.fn> = vi.fn();
  removeLayer: ReturnType<typeof vi.fn> = vi.fn();
  getLayer: ReturnType<typeof vi.fn> = vi.fn();
  project: ReturnType<typeof vi.fn> = vi.fn(() => ({ x: 0, y: 0 }));
  getContainer: ReturnType<typeof vi.fn> = vi.fn(() => document.createElement("div"));
  unproject: ReturnType<typeof vi.fn> = vi.fn(() => ({ lng: 0, lat: 0 }));
  queryRenderedFeatures: ReturnType<typeof vi.fn> = vi.fn(() => []);
  easeTo: ReturnType<typeof vi.fn> = vi.fn();
  fitBounds: ReturnType<typeof vi.fn> = vi.fn();

  private listeners = new Map<string, Set<Listener>>();
  // Real maplibre-gl's Evented class keeps this same original->wrapped
  // mapping (see its `_oneTimeListeners`) specifically so `off(event,
  // originalCallback)` can cancel a pending `once()` registration —
  // without it, `off` can only ever find the wrapper it never received.
  private onceWrappers = new Map<string, Map<Listener, Listener>>();
  private isLoaded = false;

  loaded: ReturnType<typeof vi.fn> = vi.fn(() => this.isLoaded);

  /** `on(event, cb)` and `on(event, layerId, cb)` both key into the same registry — a layer-scoped registration just uses `"${event}:${layerId}"` as the key instead of bare `event`, so it can never collide with (or be fired by) a whole-map listener for the same event name. */
  private static key(event: string, layerId?: string): string {
    return layerId === undefined ? event : `${event}:${layerId}`;
  }

  on: ReturnType<typeof vi.fn<EventBinder>> = vi.fn<EventBinder>((event, layerIdOrCb, maybeCb) => {
    const isLayerScoped = typeof layerIdOrCb === "string";
    const key = MapMock.key(event, isLayerScoped ? layerIdOrCb : undefined);
    const cb = (isLayerScoped ? maybeCb : layerIdOrCb) as Listener;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)?.add(cb);
    return this;
  });

  once: ReturnType<typeof vi.fn<EventBinder>> = vi.fn<EventBinder>((event, layerIdOrCb, maybeCb) => {
    const isLayerScoped = typeof layerIdOrCb === "string";
    const key = MapMock.key(event, isLayerScoped ? layerIdOrCb : undefined);
    const cb = (isLayerScoped ? maybeCb : layerIdOrCb) as Listener;
    const wrapped: Listener = (...args) => {
      if (isLayerScoped) {
        this.off(event, layerIdOrCb, cb);
      } else {
        this.off(event, cb);
      }
      cb(...args);
    };
    if (!this.onceWrappers.has(key)) this.onceWrappers.set(key, new Map());
    this.onceWrappers.get(key)?.set(cb, wrapped);
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)?.add(wrapped);
    return this;
  });

  off: ReturnType<typeof vi.fn<EventBinder>> = vi.fn<EventBinder>((event, layerIdOrCb, maybeCb) => {
    const isLayerScoped = typeof layerIdOrCb === "string";
    const key = MapMock.key(event, isLayerScoped ? layerIdOrCb : undefined);
    const cb = (isLayerScoped ? maybeCb : layerIdOrCb) as Listener;
    const wrapper = this.onceWrappers.get(key)?.get(cb);
    if (wrapper) {
      this.listeners.get(key)?.delete(wrapper);
      this.onceWrappers.get(key)?.delete(cb);
    } else {
      this.listeners.get(key)?.delete(cb);
    }
    return this;
  });

  trigger = (event: string, ...args: unknown[]): void => {
    if (event === "load") this.isLoaded = true;
    for (const cb of [...(this.listeners.get(event) ?? [])]) cb(...args);
  };

  triggerLayerEvent = (event: string, layerId: string, ...args: unknown[]): void => {
    for (const cb of [...(this.listeners.get(MapMock.key(event, layerId)) ?? [])]) cb(...args);
  };

  constructor(options: Record<string, unknown>) {
    this.options = options;
    mapInstances.push(this);
  }
}

class NavigationControlMock {}

/**
 * `useMapInstance.ts` calls the real `setWorkerUrl` at module load time
 * (not inside a function) — this needs to exist here regardless of
 * whether any given test cares about it, or importing that module at all
 * would throw. Explicitly typed: `tsc --noEmit` rejects a bare `vi.fn()`
 * export here (TS2742 — the inferred mock type isn't portably nameable).
 */
export const setWorkerUrl: (url: string) => void = vi.fn();

export { MapMock as Map, NavigationControlMock as NavigationControl };
