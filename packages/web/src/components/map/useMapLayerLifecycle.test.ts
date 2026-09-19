import { act, renderHook } from "@testing-library/react";
import type { AddLayerObject } from "maplibre-gl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Map as MapMock, mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { useMapLayerLifecycle } from "./useMapLayerLifecycle.js";

const testLayer: AddLayerObject = { id: "test-layer", type: "circle", source: "test-source", paint: {} };

function newMap() {
  return new MapMock({}) as unknown as import("maplibre-gl").Map;
}

describe("useMapLayerLifecycle", () => {
  beforeEach(() => resetMaplibreMock());

  it("does nothing while data is undefined", () => {
    const map = newMap();
    renderHook(() =>
      useMapLayerLifecycle(map, undefined, vi.fn(), { sourceId: "test-source", layers: [testLayer] }),
    );
    expect(mapInstances[0]?.addSource).not.toHaveBeenCalled();
  });

  it("waits for the map's 'load' event before applying", () => {
    const map = newMap();
    const apply = vi.fn();
    renderHook(() =>
      useMapLayerLifecycle(map, 1, apply, { sourceId: "test-source", layers: [testLayer] }),
    );
    expect(apply).not.toHaveBeenCalled();

    act(() => mapInstances[0]!.trigger("load"));

    expect(apply).toHaveBeenCalledWith(map, 1);
  });

  it("applies immediately if the map is already loaded", () => {
    const map = newMap();
    (map as unknown as { loaded: ReturnType<typeof vi.fn> }).loaded = vi.fn(() => true);
    const apply = vi.fn();

    renderHook(() =>
      useMapLayerLifecycle(map, 1, apply, { sourceId: "test-source", layers: [testLayer] }),
    );

    expect(apply).toHaveBeenCalledWith(map, 1);
  });

  it("re-applies on a new data value without tearing the layer/source down first — the flicker fix (R4: a live-changing FilterBar window used to blank the map on every refetch)", () => {
    const map = newMap();
    (map as unknown as { loaded: ReturnType<typeof vi.fn> }).loaded = vi.fn(() => true);
    const apply = vi.fn();

    const { rerender } = renderHook(({ data }) => useMapLayerLifecycle(map, data, apply, { sourceId: "test-source", layers: [testLayer] }), {
      initialProps: { data: 1 },
    });
    expect(apply).toHaveBeenCalledWith(map, 1);

    rerender({ data: 2 });

    expect(apply).toHaveBeenCalledWith(map, 2);
    expect(mapInstances[0]?.removeLayer).not.toHaveBeenCalled();
    expect(mapInstances[0]?.removeSource).not.toHaveBeenCalled();
  });

  it("leaves a previously-applied layer/source alone when data becomes undefined (e.g. a refetch starts) rather than blanking it", () => {
    const map = newMap();
    (map as unknown as { loaded: ReturnType<typeof vi.fn> }).loaded = vi.fn(() => true);
    const apply = vi.fn();

    const { rerender } = renderHook(
      ({ data }: { data: number | undefined }) =>
        useMapLayerLifecycle(map, data, apply, { sourceId: "test-source", layers: [testLayer] }),
      { initialProps: { data: 1 as number | undefined } },
    );
    expect(apply).toHaveBeenCalledTimes(1);

    rerender({ data: undefined });

    expect(mapInstances[0]?.removeLayer).not.toHaveBeenCalled();
    expect(mapInstances[0]?.removeSource).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledTimes(1); // not called again with undefined
  });

  it("removes all layers and the source on unmount", () => {
    const map = newMap();
    const { unmount } = renderHook(() =>
      useMapLayerLifecycle(map, 1, vi.fn(), { sourceId: "test-source", layers: [testLayer] }),
    );
    mapInstances[0]!.getLayer.mockReturnValue({ id: "test-layer" });
    mapInstances[0]!.getSource.mockReturnValue({});
    act(() => mapInstances[0]!.trigger("load"));

    unmount();

    expect(mapInstances[0]?.removeLayer).toHaveBeenCalledWith("test-layer");
    expect(mapInstances[0]?.removeSource).toHaveBeenCalledWith("test-source");
  });
});
