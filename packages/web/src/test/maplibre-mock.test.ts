import { beforeEach, describe, expect, it, vi } from "vitest";
import { Map as MapMock } from "./maplibre-mock.js";

/**
 * Coverage for the mock itself, not a feature — this is shared test
 * infrastructure every map-layer test depends on, so its own event
 * semantics need to actually match real maplibre-gl's, not just look
 * plausible.
 */
describe("MapMock event semantics", () => {
  let map: InstanceType<typeof MapMock>;

  beforeEach(() => {
    map = new MapMock({});
  });

  it("off(event, originalCallback) cancels a pending once() registered with that same callback", () => {
    // This is exactly how ProbabilityLayer.tsx cleans up:
    // map.once("load", applyToMap) then, on unmount, map.off("load", applyToMap).
    const cb = vi.fn();
    map.once("load", cb);

    map.off("load", cb);
    map.trigger("load");

    expect(cb).not.toHaveBeenCalled();
  });

  it("once() still fires normally when off() is never called", () => {
    const cb = vi.fn();
    map.once("load", cb);

    map.trigger("load");

    expect(cb).toHaveBeenCalledOnce();
  });

  it("once() only fires once even if the event triggers twice", () => {
    const cb = vi.fn();
    map.once("load", cb);

    map.trigger("load");
    map.trigger("load");

    expect(cb).toHaveBeenCalledOnce();
  });

  it("off(event, cb) also cancels a regular on() registration", () => {
    const cb = vi.fn();
    map.on("data", cb);

    map.off("data", cb);
    map.trigger("data");

    expect(cb).not.toHaveBeenCalled();
  });

  it("on(event, layerId, cb) registers a layer-scoped listener, fired only by triggerLayerEvent for that exact layer", () => {
    const cb = vi.fn();
    map.on("click", "sightings-points", cb);

    map.triggerLayerEvent("click", "sightings-points", { lngLat: [1, 2] });

    expect(cb).toHaveBeenCalledWith({ lngLat: [1, 2] });
  });

  it("a layer-scoped listener does NOT fire from a plain trigger(event, ...) call", () => {
    const cb = vi.fn();
    map.on("click", "sightings-points", cb);

    map.trigger("click");

    expect(cb).not.toHaveBeenCalled();
  });

  it("a layer-scoped listener does NOT fire for a different layer's triggerLayerEvent", () => {
    const cb = vi.fn();
    map.on("click", "sightings-points", cb);

    map.triggerLayerEvent("click", "probability-cells", {});

    expect(cb).not.toHaveBeenCalled();
  });

  it("off(event, layerId, cb) cancels a layer-scoped registration", () => {
    const cb = vi.fn();
    map.on("click", "sightings-points", cb);

    map.off("click", "sightings-points", cb);
    map.triggerLayerEvent("click", "sightings-points", {});

    expect(cb).not.toHaveBeenCalled();
  });
});
