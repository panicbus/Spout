import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Map as MapMock, mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { useProjectedPoint } from "./useProjectedPoint.js";

function newMap() {
  return new MapMock({}) as unknown as import("maplibre-gl").Map;
}

describe("useProjectedPoint", () => {
  beforeEach(() => resetMaplibreMock());

  it("returns null when lngLat is null", () => {
    const map = newMap();
    const { result } = renderHook(() => useProjectedPoint(map, null));
    expect(result.current).toBeNull();
  });

  it("returns null when map is null", () => {
    const { result } = renderHook(() => useProjectedPoint(null, [-122.1, 36.5]));
    expect(result.current).toBeNull();
  });

  it("projects the given lngLat immediately on mount", () => {
    const map = newMap();
    mapInstances[0]!.project.mockReturnValue({ x: 42, y: 100 });

    const { result } = renderHook(() => useProjectedPoint(map, [-122.1, 36.5]));

    expect(mapInstances[0]!.project).toHaveBeenCalledWith([-122.1, 36.5]);
    expect(result.current).toEqual({ x: 42, y: 100 });
  });

  it("re-projects when the map moves, so the card stays pinned to its feature during a pan/zoom", () => {
    const map = newMap();
    mapInstances[0]!.project.mockReturnValue({ x: 0, y: 0 });

    const { result } = renderHook(() => useProjectedPoint(map, [-122.1, 36.5]));

    mapInstances[0]!.project.mockReturnValue({ x: 200, y: 50 });
    act(() => mapInstances[0]!.trigger("move"));

    expect(result.current).toEqual({ x: 200, y: 50 });
  });

  it("re-projects against the new coordinate when lngLat changes", () => {
    const map = newMap();
    mapInstances[0]!.project.mockImplementation((lngLat: [number, number]) => ({ x: lngLat[0], y: lngLat[1] }));

    const { result, rerender } = renderHook(({ lngLat }) => useProjectedPoint(map, lngLat), {
      initialProps: { lngLat: [-122.1, 36.5] as [number, number] },
    });
    expect(result.current).toEqual({ x: -122.1, y: 36.5 });

    rerender({ lngLat: [-121.0, 37.0] });
    expect(result.current).toEqual({ x: -121.0, y: 37.0 });
  });

  it("stops tracking (unregisters the move listener) once lngLat becomes null", () => {
    const map = newMap();
    const { result, rerender } = renderHook(({ lngLat }) => useProjectedPoint(map, lngLat), {
      initialProps: { lngLat: [-122.1, 36.5] as [number, number] | null },
    });

    rerender({ lngLat: null });

    expect(result.current).toBeNull();
    expect(mapInstances[0]!.off).toHaveBeenCalledWith("move", expect.any(Function));
  });

  it("unregisters the move listener on unmount", () => {
    const map = newMap();
    const { unmount } = renderHook(() => useProjectedPoint(map, [-122.1, 36.5]));

    unmount();

    expect(mapInstances[0]!.off).toHaveBeenCalledWith("move", expect.any(Function));
  });
});
