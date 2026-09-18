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
});
