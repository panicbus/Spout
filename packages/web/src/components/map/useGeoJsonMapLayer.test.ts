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

describe("useGeoJsonMapLayer", () => {
  beforeEach(() => resetMaplibreMock());

  it("does nothing while the fetch is still loading", () => {
    const map = new MapMock({}) as unknown as import("maplibre-gl").Map;
    renderHook(() =>
      useGeoJsonMapLayer(map, { state: "loading" }, () => fakeGeoJson(1), {
        sourceId: "test-source",
        layers: [testLayer],
      }),
    );
    expect(mapInstances[0]?.addSource).not.toHaveBeenCalled();
  });

  it("waits for the map's 'load' event before adding the source and layers", () => {
    const map = new MapMock({}) as unknown as import("maplibre-gl").Map;
    renderHook(() =>
      useGeoJsonMapLayer(map, { state: "ok", data: 1 }, () => fakeGeoJson(1), {
        sourceId: "test-source",
        layers: [testLayer],
      }),
    );
    const mock = mapInstances[0]!;
    expect(mock.once).toHaveBeenCalledWith("load", expect.any(Function));
    expect(mock.addSource).not.toHaveBeenCalled();

    act(() => mock.trigger("load"));

    expect(mock.addSource).toHaveBeenCalledWith(
      "test-source",
      expect.objectContaining({ type: "geojson" }),
    );
    expect(mock.addLayer).toHaveBeenCalledWith(testLayer);
  });

  it("adds immediately if the map is already loaded", () => {
    const map = new MapMock({}) as unknown as import("maplibre-gl").Map;
    (map as unknown as { loaded: ReturnType<typeof vi.fn> }).loaded = vi.fn(() => true);

    renderHook(() =>
      useGeoJsonMapLayer(map, { state: "ok", data: 1 }, () => fakeGeoJson(1), {
        sourceId: "test-source",
        layers: [testLayer],
      }),
    );

    expect(mapInstances[0]?.addSource).toHaveBeenCalled();
  });

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

  it("removes all layers and the source on unmount", () => {
    const map = new MapMock({}) as unknown as import("maplibre-gl").Map;
    const { unmount } = renderHook(() =>
      useGeoJsonMapLayer(map, { state: "ok", data: 1 }, () => fakeGeoJson(1), {
        sourceId: "test-source",
        layers: [testLayer],
      }),
    );
    mapInstances[0]!.getLayer.mockReturnValue({ id: "test-layer" });
    mapInstances[0]!.getSource.mockReturnValue({ setData: vi.fn() });
    act(() => mapInstances[0]!.trigger("load"));

    unmount();

    expect(mapInstances[0]?.removeLayer).toHaveBeenCalledWith("test-layer");
    expect(mapInstances[0]?.removeSource).toHaveBeenCalledWith("test-source");
  });
});
