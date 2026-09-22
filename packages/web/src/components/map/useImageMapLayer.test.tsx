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

function Harness({ result, beforeId }: { result: FetchState<{ url: string }>; beforeId?: string }) {
  const map = useMap();
  useImageMapLayer(map, result, toImage, { sourceId: SOURCE_ID, layers: [RASTER_LAYER], beforeId });
  return null;
}

function renderHarness(result: FetchState<{ url: string }>, beforeId?: string) {
  return render(
    <MapCanvas>
      <Harness result={result} beforeId={beforeId} />
    </MapCanvas>,
  );
}

// Load-gating and unmount teardown are useMapLayerLifecycle's own behavior
// (see its test file) — this file only covers what useImageMapLayer adds:
// the addSource/updateImage choice and beforeId placement.
describe("useImageMapLayer", () => {
  beforeEach(() => {
    resetMaplibreMock();
  });

  it("adds the source/layer once the map's 'load' event fires", async () => {
    renderHarness({ state: "ok", data: { url: "data:image/png;base64,abc" } });
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));

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

  it("inserts the layer below beforeId when that layer already exists on the map", async () => {
    renderHarness({ state: "ok", data: { url: "data:image/png;base64,abc" } }, "already-there-layer");
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getLayer.mockReturnValue({ id: "already-there-layer" });

    map.trigger("load");

    expect(map.addLayer).toHaveBeenCalledWith(RASTER_LAYER, "already-there-layer");
  });

  it("falls back to adding on top when beforeId doesn't exist on the map yet (never passes a beforeId MapLibre would reject)", async () => {
    renderHarness({ state: "ok", data: { url: "data:image/png;base64,abc" } }, "not-there-yet-layer");
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getLayer.mockReturnValue(undefined);

    map.trigger("load");

    expect(map.addLayer).toHaveBeenCalledWith(RASTER_LAYER);
  });
});
