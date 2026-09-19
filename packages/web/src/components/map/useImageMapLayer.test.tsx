import type { AddLayerObject } from "maplibre-gl";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchState } from "../../lib/useFetch.js";
import { mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { MapCanvas } from "./MapCanvas.js";
import { useMap } from "./MapContext.js";
import { useImageMapLayer } from "./useImageMapLayer.js";

const SOURCE_ID = "test-image-source";
const RASTER_LAYER: AddLayerObject = { id: "test-raster-layer", type: "raster", source: SOURCE_ID };
const COORDINATES = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
] as [[number, number], [number, number], [number, number], [number, number]];

function toImage(data: { url: string }) {
  return { url: data.url, coordinates: COORDINATES };
}

function Harness({ result }: { result: FetchState<{ url: string }> }) {
  const map = useMap();
  useImageMapLayer(map, result, toImage, { sourceId: SOURCE_ID, layers: [RASTER_LAYER] });
  return null;
}

function renderHarness(result: FetchState<{ url: string }>) {
  return render(
    <MapCanvas>
      <Harness result={result} />
    </MapCanvas>,
  );
}

describe("useImageMapLayer", () => {
  beforeEach(() => {
    resetMaplibreMock();
  });

  it("does not add the source/layer until the map's 'load' event fires", async () => {
    renderHarness({ state: "ok", data: { url: "data:image/png;base64,abc" } });
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));

    expect(map.addSource).not.toHaveBeenCalled();

    map.trigger("load");

    expect(map.addSource).toHaveBeenCalledWith(SOURCE_ID, {
      type: "image",
      url: "data:image/png;base64,abc",
      coordinates: COORDINATES,
    });
    expect(map.addLayer).toHaveBeenCalledWith(RASTER_LAYER);
  });

  it("updates the existing source's image instead of re-adding it if the layer is already on the map", async () => {
    const updateImage = vi.fn();

    renderHarness({ state: "ok", data: { url: "data:image/png;base64,abc" } });
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getSource.mockReturnValue({ updateImage });
    map.trigger("load");

    expect(map.addSource).not.toHaveBeenCalled();
    expect(updateImage).toHaveBeenCalledWith({ url: "data:image/png;base64,abc", coordinates: COORDINATES });
  });

  it("removes the layer and source on unmount", async () => {
    const { unmount } = renderHarness({ state: "ok", data: { url: "data:image/png;base64,abc" } });
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getLayer.mockReturnValue({ id: RASTER_LAYER.id });
    map.getSource.mockReturnValue({ updateImage: vi.fn() });
    map.trigger("load");

    unmount();

    expect(map.removeLayer).toHaveBeenCalledWith(RASTER_LAYER.id);
    expect(map.removeSource).toHaveBeenCalledWith(SOURCE_ID);
  });

  it("does nothing while the fetch is still loading", () => {
    renderHarness({ state: "loading" });
    const map = mapInstances[0]!;
    map.trigger("load");

    expect(map.addSource).not.toHaveBeenCalled();
  });
});
