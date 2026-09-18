import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAP_STYLE_URL } from "../../lib/mapConfig.js";
import { mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { useMapInstance } from "./useMapInstance.js";

describe("useMapInstance", () => {
  beforeEach(() => resetMaplibreMock());

  it("does not construct a map before a container element is attached", () => {
    renderHook(() => useMapInstance());
    expect(mapInstances).toHaveLength(0);
  });

  it("constructs the map against the container, centered on the California coast", () => {
    const { result } = renderHook(() => useMapInstance());
    const container = document.createElement("div");

    act(() => result.current.containerRef(container));

    expect(mapInstances).toHaveLength(1);
    expect(mapInstances[0]?.options).toMatchObject({
      container,
      style: MAP_STYLE_URL,
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
    });
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
