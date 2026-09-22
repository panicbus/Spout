import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapCanvas } from "../../components/map/MapCanvas.js";
import { mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { SIGHTINGS_CLUSTERS_LAYER_ID } from "./SightingsLayer.js";
import { GlobalDensityLayer } from "./GlobalDensityLayer.js";

describe("GlobalDensityLayer", () => {
  it("adds the GBIF density raster source/layer once the map has loaded", async () => {
    resetMaplibreMock();
    render(
      <MapCanvas>
        <GlobalDensityLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));

    map.trigger("load");

    expect(map.addSource).toHaveBeenCalledWith(
      "gbif-density",
      expect.objectContaining({ type: "raster", tiles: expect.arrayContaining([expect.stringContaining("api.gbif.org")]) as unknown as string[] }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: "gbif-density-tiles" }));
  });

  it("inserts below the sightings clusters layer when it already exists, to stay under real pins", async () => {
    resetMaplibreMock();
    render(
      <MapCanvas>
        <GlobalDensityLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getLayer.mockReturnValue({ id: SIGHTINGS_CLUSTERS_LAYER_ID });

    map.trigger("load");

    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gbif-density-tiles" }),
      SIGHTINGS_CLUSTERS_LAYER_ID,
    );
  });

  it("removes the source and layer on unmount", async () => {
    resetMaplibreMock();
    const { unmount } = render(
      <MapCanvas>
        <GlobalDensityLayer />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getLayer.mockReturnValue({ id: "gbif-density-tiles" });
    map.getSource.mockReturnValue({});
    map.trigger("load");

    unmount();

    expect(map.removeLayer).toHaveBeenCalledWith("gbif-density-tiles");
    expect(map.removeSource).toHaveBeenCalledWith("gbif-density");
  });
});
