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
type EventBinder = (event: string, cb: Listener) => unknown;

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
  on: ReturnType<typeof vi.fn<EventBinder>>;
  once: ReturnType<typeof vi.fn<EventBinder>>;
  off: ReturnType<typeof vi.fn<EventBinder>>;
  loaded: ReturnType<typeof vi.fn>;
  /** Test-only: invokes every callback registered for `event`, as the real event would. */
  trigger: (event: string, ...args: unknown[]) => void;
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

  private listeners = new Map<string, Set<Listener>>();
  // Real maplibre-gl's Evented class keeps this same original->wrapped
  // mapping (see its `_oneTimeListeners`) specifically so `off(event,
  // originalCallback)` can cancel a pending `once()` registration —
  // without it, `off` can only ever find the wrapper it never received.
  private onceWrappers = new Map<string, Map<Listener, Listener>>();
  private isLoaded = false;

  loaded: ReturnType<typeof vi.fn> = vi.fn(() => this.isLoaded);

  on: ReturnType<typeof vi.fn<EventBinder>> = vi.fn<EventBinder>((event, cb) => {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(cb);
    return this;
  });

  once: ReturnType<typeof vi.fn<EventBinder>> = vi.fn<EventBinder>((event, cb) => {
    const wrapped: Listener = (...args) => {
      this.off(event, cb);
      cb(...args);
    };
    if (!this.onceWrappers.has(event)) this.onceWrappers.set(event, new Map());
    this.onceWrappers.get(event)?.set(cb, wrapped);
    this.on(event, wrapped);
    return this;
  });

  off: ReturnType<typeof vi.fn<EventBinder>> = vi.fn<EventBinder>((event, cb) => {
    const wrapper = this.onceWrappers.get(event)?.get(cb);
    if (wrapper) {
      this.listeners.get(event)?.delete(wrapper);
      this.onceWrappers.get(event)?.delete(cb);
    } else {
      this.listeners.get(event)?.delete(cb);
    }
    return this;
  });

  trigger = (event: string, ...args: unknown[]): void => {
    if (event === "load") this.isLoaded = true;
    for (const cb of [...(this.listeners.get(event) ?? [])]) cb(...args);
  };

  constructor(options: Record<string, unknown>) {
    this.options = options;
    mapInstances.push(this);
  }
}

class NavigationControlMock {}

export { MapMock as Map, NavigationControlMock as NavigationControl };
