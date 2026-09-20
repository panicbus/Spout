import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Map as MapMock, mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { useLayerClick } from "./useLayerClick.js";

function newMap() {
  return new MapMock({}) as unknown as import("maplibre-gl").Map;
}

describe("useLayerClick", () => {
  beforeEach(() => resetMaplibreMock());

  it("does nothing when map is null", () => {
    const onFeatureClick = vi.fn();
    renderHook(() => useLayerClick(null, "sightings-points", onFeatureClick));
    expect(mapInstances).toHaveLength(0);
  });

  it("registers a click listener scoped to the given layer, not the whole map", () => {
    const map = newMap();
    const onFeatureClick = vi.fn();
    renderHook(() => useLayerClick(map, "sightings-points", onFeatureClick));

    expect(mapInstances[0]?.on).toHaveBeenCalledWith("click", "sightings-points", expect.any(Function));
  });

  it("calls onFeatureClick with the clicked feature when one is present", () => {
    const map = newMap();
    const onFeatureClick = vi.fn();
    renderHook(() => useLayerClick(map, "sightings-points", onFeatureClick));

    const feature = { properties: { id: "gbif:1" } };
    act(() => mapInstances[0]!.triggerLayerEvent("click", "sightings-points", { features: [feature] }));

    expect(onFeatureClick).toHaveBeenCalledWith(feature);
  });

  it("does not call onFeatureClick when the click event has no features", () => {
    const map = newMap();
    const onFeatureClick = vi.fn();
    renderHook(() => useLayerClick(map, "sightings-points", onFeatureClick));

    act(() => mapInstances[0]!.triggerLayerEvent("click", "sightings-points", { features: [] }));

    expect(onFeatureClick).not.toHaveBeenCalled();
  });

  it("unregisters the listener on unmount", () => {
    const map = newMap();
    const { unmount } = renderHook(() => useLayerClick(map, "sightings-points", vi.fn()));

    unmount();

    expect(mapInstances[0]?.off).toHaveBeenCalledWith("click", "sightings-points", expect.any(Function));
  });
});
