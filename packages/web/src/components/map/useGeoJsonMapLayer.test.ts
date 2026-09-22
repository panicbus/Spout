import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddLayerObject } from "maplibre-gl";
import { mapInstances, resetMaplibreMock, Map as MapMock } from "../../test/maplibre-mock.js";
import { useGeoJsonMapLayer } from "./useGeoJsonMapLayer.js";

const testLayer: AddLayerObject = {
  id: "test-layer",
  type: "circle",
  source: "test-source",
  paint: {},
};

function fakeGeoJson(n: number) {
  return { type: "FeatureCollection" as const, features: [], meta: n };
}

// Load-gating (waits for 'load', applies immediately if already loaded,
// no-ops while data is undefined/loading) and unmount teardown are all
// useMapLayerLifecycle's own behavior — see its test file. This file only
// covers what useGeoJsonMapLayer adds on top of that shared skeleton.
describe("useGeoJsonMapLayer", () => {
  beforeEach(() => resetMaplibreMock());

  it("passes sourceOptions through to addSource (e.g. clustering)", () => {
    const map = new MapMock({}) as unknown as import("maplibre-gl").Map;
    renderHook(() =>
      useGeoJsonMapLayer(map, { state: "ok", data: 1 }, () => fakeGeoJson(1), {
        sourceId: "test-source",
        layers: [testLayer],
        sourceOptions: { cluster: true, clusterRadius: 50 },
      }),
    );
    act(() => mapInstances[0]!.trigger("load"));

    expect(mapInstances[0]?.addSource).toHaveBeenCalledWith(
      "test-source",
      expect.objectContaining({ cluster: true, clusterRadius: 50 }),
    );
  });

  it("updates the existing source's data instead of re-adding layers on a refetch", () => {
    const map = new MapMock({}) as unknown as import("maplibre-gl").Map;
    const setData = vi.fn();
    renderHook(() =>
      useGeoJsonMapLayer(map, { state: "ok", data: 1 }, () => fakeGeoJson(1), {
        sourceId: "test-source",
        layers: [testLayer],
      }),
    );
    mapInstances[0]!.getSource.mockReturnValue({ setData });
    act(() => mapInstances[0]!.trigger("load"));

    expect(mapInstances[0]?.addSource).not.toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith(fakeGeoJson(1));
  });
});
