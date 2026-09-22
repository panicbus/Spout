import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MAP_BOUNDS, DEFAULT_MAP_FIT_OPTIONS, MAP_STYLE_URL } from "../../lib/mapConfig.js";

/**
 * MapLibre's own default worker-URL resolution silently resolves to a
 * path that doesn't exist in this app's production build — the map still
 * rendered the base style (that alone doesn't need the worker), but every
 * data layer in this app is gated on the map's 'load' event, which itself
 * waits on worker-processed tiles, so 'load' never fired and nothing
 * about that ever reached the screen. No console error from the app
 * itself; reproduced only by inspecting the live map instance directly.
 * Never reproduced in local dev, where Vite's dev server resolves
 * `maplibre-gl`'s internals straight out of node_modules; only a real
 * production build hits this.
 *
 * `vite.config.ts`'s `viteStaticCopy` puts MapLibre's own pre-built
 * worker bundle at this exact, stable, unhashed path — and, critically,
 * puts `maplibre-gl-shared.mjs` (a real dependency the worker file
 * imports via a plain, un-rewritten `./maplibre-gl-shared.mjs` baked into
 * its own source) right next to it. Pointing `setWorkerUrl` at a
 * *content-hashed* copy of just the worker file (an earlier version of
 * this fix) still failed: the worker loaded, but its own relative import
 * of the shared chunk then 404'd, since nothing had copied that file to
 * the hashed name/location the worker's literal import string expected
 * — confirmed live by instantiating the worker directly and catching its
 * `error` event. Set once, at module load, before any Map is constructed.
 */
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/**
 * Owns the MapLibre GL map's full lifecycle: construction against a
 * container element, standard controls, and teardown on unmount. This is
 * the one place in the app that imports `maplibre-gl` directly — every
 * layer feature (`features/probability`, `features/sightings`, ...) reads
 * `map` from this hook instead of touching the library itself.
 *
 * Takes a callback ref rather than an element/ref-object, so it also
 * works the render before the container div exists.
 */
export function useMapInstance() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!container) return;

    const instance = new MapLibreMap({
      container,
      style: MAP_STYLE_URL,
    });
    // Framing the initial view via fitBounds() as an imperative call
    // rather than the constructor's own `bounds` option — functionally
    // equivalent (both were tried live; neither was the actual cause of
    // the 'load'-never-fires bug this hook's setWorkerUrl call above
    // fixes, which is real and worth double-checking before assuming a
    // future MapLibre upgrade makes this moot). Kept as an imperative
    // call mainly because `animate: false` reads more explicitly here
    // than folded into a constructor option.
    instance.fitBounds(DEFAULT_MAP_BOUNDS, { ...DEFAULT_MAP_FIT_OPTIONS, animate: false });
    instance.addControl(new NavigationControl(), "top-right");

    // This is React's own documented shape for synchronizing with an
    // external system (https://react.dev/learn/synchronizing-with-effects):
    // construct the external instance in the effect, then expose it via
    // state so consumers re-render once it exists. There's no React state
    // driving this effect that could cascade — it re-runs only when
    // `container` (a DOM node) changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMap(instance);

    return () => {
      instance.remove();
      setMap(null);
    };
  }, [container]);

  const containerRef = useCallback((element: HTMLDivElement | null) => {
    setContainer(element);
  }, []);

  return { containerRef, map };
}
