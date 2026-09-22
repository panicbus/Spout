import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MAP_BOUNDS, DEFAULT_MAP_FIT_OPTIONS, MAP_STYLE_URL } from "../../lib/mapConfig.js";
import { mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { useMapInstance } from "./useMapInstance.js";

describe("useMapInstance", () => {
  beforeEach(() => resetMaplibreMock());

  it("does not construct a map before a container element is attached", () => {
    renderHook(() => useMapInstance());
    expect(mapInstances).toHaveLength(0);
  });

  it("constructs the map against the container", () => {
    const { result } = renderHook(() => useMapInstance());
    const container = document.createElement("div");

    act(() => result.current.containerRef(container));

    expect(mapInstances).toHaveLength(1);
    expect(mapInstances[0]?.options).toMatchObject({
      container,
      style: MAP_STYLE_URL,
    });
  });

  // A real MapLibre bug this project hit live: passing `bounds` to the
  // *constructor* left the map's 'load' event permanently unfired in
  // production, so every data layer (gated on 'load') silently never
  // rendered — confirmed by inspecting the live map instance directly,
  // no console error. Calling fitBounds() as a separate method after
  // construction sidesteps whatever construction-time interaction caused
  // that. This test is what would catch a regression back to the
  // constructor-option form.
  it("fits the initial view to the California coast bbox via fitBounds(), not the constructor's own bounds option", () => {
    const { result } = renderHook(() => useMapInstance());
    act(() => result.current.containerRef(document.createElement("div")));

    expect(mapInstances[0]?.options).not.toHaveProperty("bounds");
    expect(mapInstances[0]?.fitBounds).toHaveBeenCalledWith(
      DEFAULT_MAP_BOUNDS,
      expect.objectContaining({ ...DEFAULT_MAP_FIT_OPTIONS, animate: false }),
    );
  });

  it("adds a navigation control so touch users can zoom/rotate without relying on pinch gestures", () => {
    const { result } = renderHook(() => useMapInstance());
    act(() => result.current.containerRef(document.createElement("div")));
    expect(mapInstances[0]?.addControl).toHaveBeenCalledOnce();
  });

  it("removes the map instance on unmount to avoid leaking a WebGL context", () => {
    const { result, unmount } = renderHook(() => useMapInstance());
    act(() => result.current.containerRef(document.createElement("div")));
    unmount();
    expect(mapInstances[0]?.remove).toHaveBeenCalledOnce();
  });
});
