import { render, screen, waitFor } from "@testing-library/react";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapCanvas } from "../../components/map/MapCanvas.js";
import * as apiClient from "../../lib/apiClient.js";
import { mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { PROBABILITY_LAYER_ID, PROBABILITY_SOURCE_ID, ProbabilityLayer } from "./ProbabilityLayer.js";

vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("../../lib/apiClient.js");
  return { ...actual, fetchProbabilityGrid: vi.fn() };
});

function fakeGrid(modelDate: string) {
  return buildProbabilityGrid({ modelDate });
}

describe("ProbabilityLayer", () => {
  beforeEach(() => {
    resetMaplibreMock();
    vi.mocked(apiClient.fetchProbabilityGrid).mockReset();
  });

  it("does not add the source/layer until the map's 'load' event fires", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(fakeGrid("2026-09-15"));

    render(
      <MapCanvas>
        <ProbabilityLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    // Wait for the grid fetch to resolve AND the effect that registers
    // the 'load' listener to have actually run — not just for the fetch
    // to have been called, which can race ahead of that re-render.
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));

    expect(map.addSource).not.toHaveBeenCalled();

    map.trigger("load");

    expect(map.addSource).toHaveBeenCalledWith(
      PROBABILITY_SOURCE_ID,
      expect.objectContaining({
        type: "geojson",
        data: expect.objectContaining({ type: "FeatureCollection" }),
      }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: PROBABILITY_LAYER_ID, type: "circle" }),
    );
  });

  it("adds the source right away if the map was already loaded before the grid arrived", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(fakeGrid("2026-09-15"));

    render(
      <MapCanvas>
        <ProbabilityLayer />
      </MapCanvas>,
    );
    mapInstances[0]!.trigger("load");

    await waitFor(() => expect(mapInstances[0]!.addSource).toHaveBeenCalled());
  });

  it("updates the existing source's data instead of re-adding it if the layer is already on the map", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(fakeGrid("2026-09-15"));
    const setData = vi.fn();

    render(
      <MapCanvas>
        <ProbabilityLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getSource.mockReturnValue({ setData });
    map.trigger("load");

    expect(map.addSource).not.toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ type: "FeatureCollection" }));
  });

  it("removes the layer and source on unmount", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(fakeGrid("2026-09-15"));

    const { unmount } = render(
      <MapCanvas>
        <ProbabilityLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getLayer.mockReturnValue({ id: PROBABILITY_LAYER_ID });
    map.getSource.mockReturnValue({ setData: vi.fn() });
    map.trigger("load");

    unmount();

    expect(map.removeLayer).toHaveBeenCalledWith(PROBABILITY_LAYER_ID);
    expect(map.removeSource).toHaveBeenCalledWith(PROBABILITY_SOURCE_ID);
  });

  it("shows a model-date stamp once the grid has loaded", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(fakeGrid("2026-09-15"));

    render(
      <MapCanvas>
        <ProbabilityLayer />
      </MapCanvas>,
    );

    await waitFor(() => expect(screen.getByText(/Sep 15, 2026/)).toBeInTheDocument());
  });

  it("includes the data publisher's name in the stamp — ADR 0002 requires NOAA's credit to be visible, not deferred silently to R4", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(fakeGrid("2026-09-15"));

    render(
      <MapCanvas>
        <ProbabilityLayer />
      </MapCanvas>,
    );

    await waitFor(() => expect(screen.getByText(/NOAA WhaleWatch 2.0/)).toBeInTheDocument());
  });

  it("renders no stamp while the grid is still loading", () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReturnValue(new Promise(() => {}));

    render(
      <MapCanvas>
        <ProbabilityLayer />
      </MapCanvas>,
    );

    expect(screen.queryByText(/probability/i)).not.toBeInTheDocument();
  });
});
