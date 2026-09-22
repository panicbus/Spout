import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TimeWindow } from "@spout/contracts";
import { MapCanvas } from "../../components/map/MapCanvas.js";
import * as apiClient from "../../lib/apiClient.js";
import { mapInstances, resetMaplibreMock, type MapInstanceMock } from "../../test/maplibre-mock.js";
import {
  SIGHTINGS_CLUSTERS_LAYER_ID,
  SIGHTINGS_CLUSTER_COUNT_LAYER_ID,
  SIGHTINGS_POINTS_LAYER_ID,
  SIGHTINGS_SOURCE_ID,
  SightingsLayer,
} from "./SightingsLayer.js";
import { AGE_OPACITY, UNVERIFIED_OPACITY, VERIFIED_MIN_OPACITY } from "./pinOpacity.js";

vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("../../lib/apiClient.js");
  return { ...actual, fetchSightings: vi.fn() };
});

/** Simulates a real click on the map — the combined whole-map handler this layer uses instead of a layer-scoped listener. `lngLat` mirrors real MapLibre's `LngLat` instance shape (a `.toArray()` method), read by the empty-map-tap branch — opens `SeasonalityCard` for wherever was tapped only when nothing was already selected; otherwise it just closes whatever was open. */
function clickMap(map: MapInstanceMock, point = { x: 50, y: 50 }, lngLat: [number, number] = [-122.1, 36.5]) {
  map.trigger("click", { point, lngLat: { toArray: () => lngLat } });
}

/** A `queryRenderedFeatures`-shaped hit on the unclustered points layer, as a real MapLibre click would return. */
function pointFeature(id: string, coordinates: [number, number] = [-122.1, 36.5]) {
  return {
    layer: { id: SIGHTINGS_POINTS_LAYER_ID },
    properties: { id },
    geometry: { type: "Point", coordinates },
  };
}

/** A `queryRenderedFeatures`-shaped hit on the clusters layer. */
function clusterFeatureHit(clusterId: number, coordinates: [number, number] = [-122.1, 36.5]) {
  return {
    layer: { id: SIGHTINGS_CLUSTERS_LAYER_ID },
    properties: { cluster_id: clusterId, point_count: 12 },
    geometry: { type: "Point", coordinates },
  };
}

describe("SightingsLayer", () => {
  beforeEach(() => {
    resetMaplibreMock();
    vi.mocked(apiClient.fetchSightings).mockReset();
  });

  it("waits for the map's 'load' event before adding the clustered source and its three layers", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
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

  it("fetches sightings scoped to the `window` prop, so FilterBar's selection actually changes what's shown", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="90d" date="2026-09-12" />
      </MapCanvas>,
    );

    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledWith(expect.objectContaining({ window: "90d" })));
  });

  it("the points layer's paint expression encodes every ADR 0002/0003 visual requirement: tier color, obscured/citizen radius, and verification/age opacity", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");

    const pointsLayerCall = map.addLayer.mock.calls.find(
      (call: unknown[]) => (call[0] as { id: string }).id === SIGHTINGS_POINTS_LAYER_ID,
    );
    const paint = (
      pointsLayerCall?.[0] as {
        paint: { "circle-color": unknown[]; "circle-radius": unknown[]; "circle-opacity": unknown[][] };
      }
    ).paint;

    // Tier color (spec.md).
    expect(paint["circle-color"]).toEqual(expect.arrayContaining(["match", ["get", "tier"], "research"]));

    // Obscured coordinates render as a larger halo, and citizen-tier pins
    // are sized up from the default — both spec.md/ADR 0002 requirements
    // live in the same circle-radius expression.
    expect(paint["circle-radius"]).toEqual(expect.arrayContaining(["case", ["get", "coordinatesObscured"]]));
    expect(paint["circle-radius"]).toEqual(
      expect.arrayContaining([expect.arrayContaining(["==", ["get", "tier"], "citizen"])]),
    );

    // circle-opacity branches on verification (unverified must never
    // render identically to confirmed data), then applies an age fade
    // within each branch (ADR 0003) — both the unverified branch
    // (index 2) and the verified branch (index 3) key off the same
    // ageBucket match expression; checking the unverified branch (one
    // level shallower) covers both.
    expect(paint["circle-opacity"]).toEqual(
      expect.arrayContaining(["case", ["==", ["get", "verification"], "unverified"]]),
    );
    expect(paint["circle-opacity"][2]).toEqual(
      expect.arrayContaining([expect.arrayContaining(["match", ["get", "ageBucket"]])]),
    );
  });

  it("never lets an old-but-verified pin's combined opacity read as ambiguous with a new-but-unverified pin's (antagonist finding: multiplying age-fade into verification-fade had compressed a 0.45 gap down to 0.025)", () => {
    // Worst case for each side: the palest a verified pin can ever get
    // (VERIFIED_MIN_OPACITY, a floor regardless of age) must still be
    // clearly brighter than the brightest an unverified pin can ever get
    // (UNVERIFIED_OPACITY, at age "today" — its own ceiling, since age
    // only ever multiplies it down further).
    const palestVerified = VERIFIED_MIN_OPACITY;
    const brightestUnverified = UNVERIFIED_OPACITY * AGE_OPACITY.today;

    expect(palestVerified).toBeGreaterThan(brightestUnverified);
    // Not just barely greater — a real, perceptible gap.
    expect(palestVerified - brightestUnverified).toBeGreaterThanOrEqual(0.15);
  });

  it("filters clusters vs. unclustered points using MapLibre's point_count property", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
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
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
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
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.getSource.mockReturnValue({ setData });
    map.trigger("load");

    expect(map.addSource).not.toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ type: "FeatureCollection" }));
  });

  it("does not remove the layers/source while a FilterBar window change is still in flight — the pins must stay visible, not blank out, during the refetch", async () => {
    // Hangs specifically once the window becomes "90d" (the test's own
    // deliberate change below) — not tied to call *count*, since the
    // viewport-bbox effect (this layer now fetches scoped to the map's
    // current bounds) fires its own extra fetch shortly after mount,
    // before this test's rerender, and a fixed "2nd call hangs" scheme
    // would hang the wrong one.
    let resolveSecondFetch!: (sightings: ReturnType<typeof buildSighting>[]) => void;
    vi.mocked(apiClient.fetchSightings).mockImplementation((params) => {
      if (params?.window === "90d") {
        return new Promise((resolve) => {
          resolveSecondFetch = resolve;
        });
      }
      return Promise.resolve([buildSighting()]);
    });

    const { rerender } = render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");
    await waitFor(() => expect(map.addSource).toHaveBeenCalledTimes(1));
    map.getSource.mockReturnValue({ setData: vi.fn() });

    // Simulate a FilterBar click: the window prop changes, kicking off a
    // new (still-pending) fetch.
    rerender(
      <MapCanvas>
        <SightingsLayer timeWindow={"90d" as TimeWindow} date="2026-09-12" />
      </MapCanvas>,
    );

    expect(map.removeLayer).not.toHaveBeenCalled();
    expect(map.removeSource).not.toHaveBeenCalled();

    resolveSecondFetch([buildSighting()]);
    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledWith(expect.objectContaining({ window: "90d" })));

    // Still never torn down — the second fetch resolving just updates the
    // existing source's data in place.
    expect(map.removeLayer).not.toHaveBeenCalled();
    expect(map.removeSource).not.toHaveBeenCalled();
  });

  it("opens PinDetailCard with the tapped sighting's full data when a points-layer feature is clicked", async () => {
    const sighting = buildSighting({ id: "gbif:42", species: "orca" });
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([sighting]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");
    await waitFor(() => expect(map.addSource).toHaveBeenCalled());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    map.getLayer.mockReturnValue({ id: "exists" });
    map.queryRenderedFeatures.mockReturnValue([pointFeature("gbif:42")]);
    clickMap(map);

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("Orca"));
  });

  it("zooms into a cluster (not opening a detail card) when a cluster is clicked", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);
    const getClusterExpansionZoom = vi.fn().mockResolvedValue(9);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");
    await waitFor(() => expect(map.addSource).toHaveBeenCalled());

    map.getLayer.mockReturnValue({ id: "exists" });
    map.getSource.mockReturnValue({ setData: vi.fn(), getClusterExpansionZoom });
    map.queryRenderedFeatures.mockReturnValue([clusterFeatureHit(7, [-121.5, 36.9])]);
    clickMap(map);

    expect(getClusterExpansionZoom).toHaveBeenCalledWith(7);
    await waitFor(() => expect(map.easeTo).toHaveBeenCalledWith({ center: [-121.5, 36.9], zoom: 9 }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes an open pin detail card when the next click hits neither a point nor a cluster, without opening a seasonality card for the new tap", async () => {
    const sighting = buildSighting({ id: "gbif:42", species: "orca" });
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([sighting]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");
    await waitFor(() => expect(map.addSource).toHaveBeenCalled());

    map.getLayer.mockReturnValue({ id: "exists" });
    map.queryRenderedFeatures.mockReturnValue([pointFeature("gbif:42")]);
    clickMap(map);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("Orca"));

    map.queryRenderedFeatures.mockReturnValue([]);
    clickMap(map);

    // A tap elsewhere while a card is open is a dismiss, like tapping a
    // dialog's backdrop — it must not swap in a fresh seasonality card
    // for wherever was just tapped.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes an already-open seasonality card on the next empty-space click, rather than swapping in a new one for the new tap location", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");
    await waitFor(() => expect(map.addSource).toHaveBeenCalled());
    map.getLayer.mockReturnValue({ id: "exists" });
    map.queryRenderedFeatures.mockReturnValue([]);

    clickMap(map, { x: 50, y: 50 }, [-122.1, 36.5]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    clickMap(map, { x: 200, y: 200 }, [-70.2, 42.35]);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("never calls queryRenderedFeatures before the sightings layers exist on the map yet (it throws for a layer id that isn't there) — a click still opens a seasonality card for the tapped spot regardless, since that doesn't depend on the pins layer at all", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    // Deliberately never triggers "load" — the layers never get added.

    expect(() => clickMap(map)).not.toThrow();
    expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("still opens PinDetailCard for a still-visible pin while a refetch triggered by a FilterBar change is in flight (antagonist finding: a click handler gated on the fetch's own 'ok' state silently no-ops against pins useMapLayerLifecycle deliberately leaves on screen mid-refetch)", async () => {
    const sighting = buildSighting({ id: "gbif:42", species: "orca" });
    // Hangs once window becomes "90d" — see the sibling test above for
    // why this can't be a fixed "2nd call" scheme.
    let resolveSecondFetch!: (sightings: ReturnType<typeof buildSighting>[]) => void;
    vi.mocked(apiClient.fetchSightings).mockImplementation((params) => {
      if (params?.window === "90d") {
        return new Promise((resolve) => {
          resolveSecondFetch = resolve;
        });
      }
      return Promise.resolve([sighting]);
    });

    const { rerender } = render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");
    await waitFor(() => expect(map.addSource).toHaveBeenCalledTimes(1));
    map.getSource.mockReturnValue({ setData: vi.fn() });

    // Simulate a FilterBar click: the window prop changes, kicking off a
    // new (still-pending) fetch — the old pins, including "gbif:42",
    // stay on screen and clickable per useMapLayerLifecycle's design.
    rerender(
      <MapCanvas>
        <SightingsLayer timeWindow={"90d" as TimeWindow} date="2026-09-12" />
      </MapCanvas>,
    );

    map.getLayer.mockReturnValue({ id: "exists" });
    map.queryRenderedFeatures.mockReturnValue([pointFeature("gbif:42")]);
    clickMap(map);

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("Orca"));

    resolveSecondFetch([sighting]);
    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledWith(expect.objectContaining({ window: "90d" })));
  });

  it("closes PinDetailCard when dismissed", async () => {
    const sighting = buildSighting({ id: "gbif:42" });
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([sighting]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" date="2026-09-12" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");
    await waitFor(() => expect(map.addSource).toHaveBeenCalled());

    map.getLayer.mockReturnValue({ id: "exists" });
    map.queryRenderedFeatures.mockReturnValue([pointFeature("gbif:42")]);
    clickMap(map);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
