import { render, waitFor } from "@testing-library/react";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TimeWindow } from "@spout/contracts";
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
import { AGE_OPACITY, UNVERIFIED_OPACITY, VERIFIED_MIN_OPACITY } from "./pinOpacity.js";

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
        <SightingsLayer timeWindow="30d" />
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
        <SightingsLayer timeWindow="90d" />
      </MapCanvas>,
    );

    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledWith({ window: "90d" }));
  });

  it("colors unclustered points by tier via a match expression on the tier property", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" />
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

  it("fades unverified citizen reports rather than rendering them identically to confirmed data (spec.md / ADR 0002)", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");

    const pointsLayerCall = map.addLayer.mock.calls.find(
      (call: unknown[]) => (call[0] as { id: string }).id === SIGHTINGS_POINTS_LAYER_ID,
    );
    const paint = (pointsLayerCall?.[0] as { paint: { "circle-opacity": unknown[] } }).paint;
    // circle-opacity branches on verification, then applies an age fade
    // within each branch (see the crossover-safety test below for why
    // that fade can't just be a flat multiply) — assert on the branch
    // condition specifically rather than the whole tree.
    expect(paint["circle-opacity"]).toEqual(
      expect.arrayContaining(["case", ["==", ["get", "verification"], "unverified"]]),
    );
  });

  it("renders geoprivacy-obscured coordinates as a larger halo instead of a precise pin (spec.md / ADR 0002)", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");

    const pointsLayerCall = map.addLayer.mock.calls.find(
      (call: unknown[]) => (call[0] as { id: string }).id === SIGHTINGS_POINTS_LAYER_ID,
    );
    const paint = (pointsLayerCall?.[0] as { paint: { "circle-radius": unknown[] } }).paint;
    expect(paint["circle-radius"]).toEqual(
      expect.arrayContaining(["case", ["get", "coordinatesObscured"]]),
    );
  });

  it("fades older reports via a match expression on the ageBucket property, so recency reads on the map itself (ADR 0003)", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([buildSighting()]);

    render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" />
      </MapCanvas>,
    );
    const map = mapInstances[0]!;
    await waitFor(() => expect(map.once).toHaveBeenCalledWith("load", expect.any(Function)));
    map.trigger("load");

    const pointsLayerCall = map.addLayer.mock.calls.find(
      (call: unknown[]) => (call[0] as { id: string }).id === SIGHTINGS_POINTS_LAYER_ID,
    );
    const paint = (pointsLayerCall?.[0] as { paint: { "circle-opacity": unknown[][] } }).paint;
    // Both the unverified branch (index 2: ["*", factor, ageExpr]) and the
    // verified branch (index 3: ["max", floor, ["*", factor, ageExpr]])
    // key off the same ageBucket match expression — check the unverified
    // branch, which carries it one level shallower.
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
        <SightingsLayer timeWindow="30d" />
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
        <SightingsLayer timeWindow="30d" />
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
        <SightingsLayer timeWindow="30d" />
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
    let resolveSecondFetch!: (sightings: ReturnType<typeof buildSighting>[]) => void;
    vi.mocked(apiClient.fetchSightings)
      .mockResolvedValueOnce([buildSighting()])
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondFetch = resolve;
        }),
      );

    const { rerender } = render(
      <MapCanvas>
        <SightingsLayer timeWindow="30d" />
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
        <SightingsLayer timeWindow={"90d" as TimeWindow} />
      </MapCanvas>,
    );

    expect(map.removeLayer).not.toHaveBeenCalled();
    expect(map.removeSource).not.toHaveBeenCalled();

    resolveSecondFetch([buildSighting()]);
    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledWith({ window: "90d" }));

    // Still never torn down — the second fetch resolving just updates the
    // existing source's data in place.
    expect(map.removeLayer).not.toHaveBeenCalled();
    expect(map.removeSource).not.toHaveBeenCalled();
  });
});
