import { render, waitFor } from "@testing-library/react";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapCanvas } from "../../components/map/MapCanvas.js";
import * as apiClient from "../../lib/apiClient.js";
import { mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import {
  SIGHTINGS_CLUSTERS_LAYER_ID,
  SIGHTINGS_CLUSTER_COUNT_LAYER_ID,
  SIGHTINGS_POINTS_LAYER_ID,
  SIGHTINGS_SOURCE_ID,
  SightingsLayer,
} from "./SightingsLayer.js";

vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("../../lib/apiClient.js");
  return { ...actual, fetchSightings: vi.fn() };
});

describe("SightingsLayer", () => {
  beforeEach(() => {
    resetMaplibreMock();
    vi.mocked(apiClient.fetchSightings).mockReset();
  });

  it("waits for the map's 'load' event before adding the clustered source and its three layers", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    expect(map.addSource).not.toHaveBeenCalled();

    map.trigger("load");

    expect(map.addSource).toHaveBeenCalledWith(
      SIGHTINGS_SOURCE_ID,
      expect.objectContaining({
        type: "geojson",
        cluster: true,
        data: expect.objectContaining({ type: "FeatureCollection" }),
      }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: SIGHTINGS_CLUSTERS_LAYER_ID, source: SIGHTINGS_SOURCE_ID }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: SIGHTINGS_CLUSTER_COUNT_LAYER_ID, source: SIGHTINGS_SOURCE_ID }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: SIGHTINGS_POINTS_LAYER_ID, source: SIGHTINGS_SOURCE_ID }),
    );
  });

  it("colors unclustered points by tier via a match expression on the tier property", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");

    const pointsLayerCall = map.addLayer.mock.calls.find(
      (call: unknown[]) => (call[0] as { id: string }).id === SIGHTINGS_POINTS_LAYER_ID,
    );
    const paint = (pointsLayerCall?.[0] as { paint: { "circle-color": unknown[] } }).paint;
    expect(paint["circle-color"]).toEqual(
      expect.arrayContaining(["match", ["get", "tier"], "research"]),
    );
  });

  it("filters clusters vs. unclustered points using MapLibre's point_count property", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");

    const clustersCall = map.addLayer.mock.calls.find(
      (call: unknown[]) => (call[0] as { id: string }).id === SIGHTINGS_CLUSTERS_LAYER_ID,
    );
    const pointsCall = map.addLayer.mock.calls.find(
      (call: unknown[]) => (call[0] as { id: string }).id === SIGHTINGS_POINTS_LAYER_ID,
    );
    expect((clustersCall?.[0] as { filter: unknown[] }).filter).toEqual(["has", "point_count"]);
    expect((pointsCall?.[0] as { filter: unknown[] }).filter).toEqual([
      "!",
      ["has", "point_count"],
    ]);
  });

  it("removes the source and all three layers on unmount", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    const { unmount } = render(
      <MapCanvas>
        <SightingsLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getLayer.mockReturnValue({ id: "some-layer" });
    map.getSource.mockReturnValue({ setData: vi.fn() });
    map.trigger("load");

    unmount();

    expect(map.removeLayer).toHaveBeenCalledWith(SIGHTINGS_CLUSTERS_LAYER_ID);
    expect(map.removeLayer).toHaveBeenCalledWith(SIGHTINGS_CLUSTER_COUNT_LAYER_ID);
    expect(map.removeLayer).toHaveBeenCalledWith(SIGHTINGS_POINTS_LAYER_ID);
    expect(map.removeSource).toHaveBeenCalledWith(SIGHTINGS_SOURCE_ID);
  });

  it("updates the existing source's data instead of re-adding layers on a refetch", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);
    const setData = vi.fn();

    render(
      <MapCanvas>
        <SightingsLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getSource.mockReturnValue({ setData });
    map.trigger("load");

    expect(map.addSource).not.toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ type: "FeatureCollection" }));
  });
});
