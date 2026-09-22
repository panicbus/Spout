import type { AddLayerObject, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { Bbox, Sighting, TimeWindow } from "@spout/contracts";
import type { Point } from "geojson";
import { useEffect, useRef, useState } from "react";
import { useMap } from "../../components/map/MapContext.js";
import { useGeoJsonMapLayer } from "../../components/map/useGeoJsonMapLayer.js";
import { usePanCardIntoView } from "../../components/map/usePanCardIntoView.js";
import { useProjectedPoint } from "../../components/map/useProjectedPoint.js";
import { SeasonalityCard } from "../seasonality/SeasonalityCard.js";
import { sightingsToGeoJson } from "../../lib/sightingsGeoJson.js";
import { useNow } from "../../lib/useNow.js";
import { useSightings } from "../../lib/useSightings.js";
import { PinDetailCard } from "./PinDetailCard.js";
import { AGE_OPACITY, UNVERIFIED_OPACITY, VERIFIED_MIN_OPACITY, VERIFIED_OPACITY } from "./pinOpacity.js";

export const SIGHTINGS_SOURCE_ID = "sightings";
export const SIGHTINGS_CLUSTERS_LAYER_ID = "sightings-clusters";
export const SIGHTINGS_CLUSTER_COUNT_LAYER_ID = "sightings-cluster-count";
export const SIGHTINGS_POINTS_LAYER_ID = "sightings-points";

/** Placeholder tier colors — a real palette pass belongs to R4's UX round, not here. */
const TIER_COLORS = { research: "#2a6f97", citizen: "#e09f3e", acoustic: "#6c757d" } as const;

const clustersLayer: AddLayerObject = {
  id: SIGHTINGS_CLUSTERS_LAYER_ID,
  type: "circle",
  source: SIGHTINGS_SOURCE_ID,
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#2a6f97",
    // Bigger circle for bigger clusters, in three coarse steps.
    "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24],
    "circle-opacity": 0.75,
  },
};

const clusterCountLayer: AddLayerObject = {
  id: SIGHTINGS_CLUSTER_COUNT_LAYER_ID,
  type: "symbol",
  source: SIGHTINGS_SOURCE_ID,
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    // Must name a font the style's own glyph server actually has —
    // verified live: OpenFreeMap's "liberty" style only ships Noto Sans
    // (Regular/Bold/Italic); MapLibre's own example fonts
    // ("Open Sans Regular", "Arial Unicode MS Regular") 404 against it
    // and fall back to locally-rendered glyphs, which is both a wasted
    // network request and a font mismatch with the rest of the map.
    "text-font": ["Noto Sans Bold"],
    "text-size": 12,
  },
  paint: {
    "text-color": "#ffffff",
  },
};

/**
 * Unclustered individual sightings, colored by trust tier — this is the
 * one place tier becomes visible on the map itself, ahead of R4's richer
 * detail card. Also the one place `verification`/`coordinatesObscured`
 * become visible: spec.md ("clearly marked as unverified photo reports")
 * and ADR 0002 ("obscured/geoprivacy coordinates are never rendered as
 * precise pins") both require these to read as visually distinct, not
 * just be present in the data — `sightingsGeoJson.ts` threads both
 * properties through specifically so this layer can key off them here.
 */
const pointsLayer: AddLayerObject = {
  id: SIGHTINGS_POINTS_LAYER_ID,
  type: "circle",
  source: SIGHTINGS_SOURCE_ID,
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": [
      "match",
      ["get", "tier"],
      "research",
      TIER_COLORS.research,
      "citizen",
      TIER_COLORS.citizen,
      "acoustic",
      TIER_COLORS.acoustic,
      /* default */ "#999999",
    ],
    // Obscured coordinates are geoprivacy-randomized, not measured —
    // rendered larger and softer so it reads as an approximate area, not
    // a precise pin. Citizen reports (orange) are sized up a step from
    // research/acoustic (blue/gray) on top of that — they're the
    // majority of what a casual user actually taps, and at the default
    // 6px radius they read as barely-visible flecks against the
    // probability raster's color range.
    "circle-radius": [
      "case",
      ["get", "coordinatesObscured"],
      13,
      ["==", ["get", "tier"], "citizen"],
      9,
      6,
    ],
    // Unverified citizen reports (iNaturalist "needs_id") render faded,
    // distinct from confirmed research-grade/verified data, further faded
    // by age (the "match" on ageBucket below, from AGE_OPACITY — the one
    // definition, repeated here per branch only because MapLibre's
    // expression types don't structurally accept a shared literal
    // extracted into its own named constant) so recency also reads on the
    // map itself, not just in a tapped detail card. Verified opacity is
    // floored at VERIFIED_MIN_OPACITY regardless of age — see that
    // constant's doc comment for why age fade must NOT be allowed to push
    // a verified pin down near/below an unverified pin's ceiling.
    "circle-opacity": [
      "case",
      ["==", ["get", "verification"], "unverified"],
      [
        "*",
        UNVERIFIED_OPACITY,
        [
          "match",
          ["get", "ageBucket"],
          "today",
          AGE_OPACITY.today,
          "this-week",
          AGE_OPACITY["this-week"],
          "this-month",
          AGE_OPACITY["this-month"],
          AGE_OPACITY.older,
        ],
      ],
      [
        "max",
        VERIFIED_MIN_OPACITY,
        [
          "*",
          VERIFIED_OPACITY,
          [
            "match",
            ["get", "ageBucket"],
            "today",
            AGE_OPACITY.today,
            "this-week",
            AGE_OPACITY["this-week"],
            "this-month",
            AGE_OPACITY["this-month"],
            AGE_OPACITY.older,
          ],
        ],
      ],
    ],
    "circle-stroke-width": ["case", ["get", "coordinatesObscured"], 2, 1],
    "circle-stroke-color": "#ffffff",
    "circle-stroke-opacity": ["case", ["get", "coordinatesObscured"], 0.5, 1],
  },
};

/**
 * Renders GBIF-sourced sightings (research/citizen/acoustic tiers) as a
 * clustered MapLibre layer — three sub-layers over one clustered GeoJSON
 * source (clusters, their count labels, and unclustered individual
 * points), the standard MapLibre clustering pattern, via
 * `useGeoJsonMapLayer` (shared with `ProbabilityLayer` — see that hook's
 * doc comment for the lifecycle details neither component hand-rolls
 * anymore).
 *
 * Fetches by the map's current viewport bbox (Phase 2, "global scope")
 * rather than an unfiltered California-only fetch — the API's own
 * `GET /api/sightings` route decides, per request, whether that bbox is
 * still served by the persistent California store or the on-demand
 * global path (see `packages/api/src/store/globalSightingsCache.ts`);
 * this component doesn't need to know which.
 */
export interface SightingsLayerProps {
  timeWindow: TimeWindow;
  /** YYYY-MM-DD — which date the seasonality card (opened by tapping empty map, see the click handler below) answers "will I see a whale here" for. */
  date: string;
}

/** A selected sighting pin (its own recorded detail) or a bare tapped location (a seasonal pattern, computed live) — mutually exclusive, only one card is ever open at a time. */
type Selection = { type: "sighting"; id: string; lngLat: [number, number] } | { type: "location"; lngLat: [number, number] } | null;

export function SightingsLayer({ timeWindow, date }: SightingsLayerProps) {
  const map = useMap();

  // Tracks the map's own current bounds so `useSightings` below can scope
  // its fetch to what's actually on screen, instead of a single fixed
  // region — read immediately once `map` exists (not just on the first
  // 'moveend', which wouldn't fire until the user's first pan/zoom) and
  // kept live via 'moveend'. Starts `undefined` (no bbox param sent at
  // all) for the brief window before the map itself exists, rather than
  // an arbitrary placeholder box.
  const [viewportBbox, setViewportBbox] = useState<Bbox | undefined>(undefined);
  useEffect(() => {
    if (!map) return;
    const updateBbox = () => {
      const bounds = map.getBounds();
      setViewportBbox([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    };
    updateBbox();
    map.on("moveend", updateBbox);
    return () => {
      map.off("moveend", updateBbox);
    };
  }, [map]);

  const result = useSightings({ window: timeWindow, bbox: viewportBbox });
  const [selection, setSelection] = useState<Selection>(null);
  const [lastData, setLastData] = useState<Sighting[]>([]);

  useGeoJsonMapLayer(map, result, sightingsToGeoJson, {
    sourceId: SIGHTINGS_SOURCE_ID,
    layers: [clustersLayer, clusterCountLayer, pointsLayer],
    sourceOptions: { cluster: true, clusterMaxZoom: 14, clusterRadius: 50 },
  });

  // `useMapLayerLifecycle` deliberately leaves the previously-rendered
  // pins on screen (and clickable) for the full duration of a refetch —
  // see its own doc comment. Resolving `selection` against the last
  // successfully-fetched data (kept in sync with what's actually
  // painted, not with the in-flight fetch's own state) rather than
  // against `result` directly means a click still resolves correctly
  // mid-refetch, AND a selection that's fallen out of a newly-arrived
  // result (e.g. the user narrowed the time window past it) naturally
  // stops resolving to a sighting on the next render — no separate
  // "clear it" effect needed. Adjusted during render (React's own
  // "storing info from previous renders" pattern), not in an effect —
  // an effect that calls setState synchronously would cost an extra,
  // avoidable commit for something that's really just derived state.
  if (result.state === "ok" && result.data !== lastData) {
    setLastData(result.data);
  }

  // `sightingsToGeoJson` bakes each pin's `ageBucket` into its GeoJSON
  // properties once, at conversion time — `useGeoJsonMapLayer`'s own
  // lifecycle (above) only re-runs that conversion when `lastData` itself
  // changes (a refetch), so without this, a pin's age-based fade
  // (`pointsLayer`'s `circle-opacity`) would silently freeze at whatever
  // it was the moment its data last arrived, even as real time passes in
  // a long-open tab. Re-pushes freshly-recomputed GeoJSON straight to the
  // already-added source on every `useNow` tick — deliberately bypassing
  // `useGeoJsonMapLayer`'s add-vs-update branching (there's nothing to
  // add; the source already exists by the time this can matter) rather
  // than threading `now` through that shared hook's identity-based
  // re-apply gate.
  const now = useNow();
  useEffect(() => {
    if (!map) return;
    const source = map.getSource(SIGHTINGS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(sightingsToGeoJson(lastData, now));
  }, [map, lastData, now]);

  // One whole-map click handler, not per-layer listeners: a tap can hit
  // an individual point (open its detail card), a cluster (zoom in to
  // expand it — MapLibre's own supercluster-backed source knows the
  // right zoom level to actually split it), or neither. That third case
  // used to just dismiss whatever was open; it now opens a
  // `SeasonalityCard` for the tapped location instead — "what am I
  // likely to see here, on this date" for anywhere, not just a sighting
  // pin's own single recorded detail. Still dismisses whatever was
  // already open in the sense that only one selection (and one card) is
  // ever active at a time — see the `Selection` union above. A
  // layer-scoped listener per case can't express any of this, so this
  // queries both layers at the click point itself and branches on what
  // it finds. Guards each layer id with `getLayer` first —
  // `queryRenderedFeatures` throws (not no-ops) for a layer id that
  // doesn't exist on the map yet.
  useEffect(() => {
    if (!map) return;

    const handleClick = (e: MapMouseEvent) => {
      const layers = [SIGHTINGS_POINTS_LAYER_ID, SIGHTINGS_CLUSTERS_LAYER_ID].filter((id) => map.getLayer(id));
      const features = layers.length > 0 ? map.queryRenderedFeatures(e.point, { layers }) : [];

      const pointFeature = features.find((feature) => feature.layer.id === SIGHTINGS_POINTS_LAYER_ID);
      if (pointFeature) {
        const id = pointFeature.properties?.id as string | undefined;
        const lngLat = (pointFeature.geometry as Point).coordinates as [number, number];
        setSelection(id ? { type: "sighting", id, lngLat } : null);
        return;
      }

      const clusterFeature = features.find((feature) => feature.layer.id === SIGHTINGS_CLUSTERS_LAYER_ID);
      if (clusterFeature) {
        const clusterId = clusterFeature.properties?.cluster_id as number | undefined;
        const center = (clusterFeature.geometry as Point).coordinates as [number, number];
        const source = map.getSource(SIGHTINGS_SOURCE_ID) as GeoJSONSource | undefined;
        if (clusterId !== undefined && source) {
          source
            .getClusterExpansionZoom(clusterId)
            .then((zoom) => map.easeTo({ center, zoom }))
            // A transient query failure (source mid-update) has nothing
            // useful to recover to — just don't crash the click handler.
            .catch(() => {});
        }
        return;
      }

      // Neither a pin nor a cluster was hit. If a card is already open,
      // this tap is a dismiss (matching how tapping a dialog's backdrop
      // closes it) — it must not swap in a fresh seasonality card for
      // wherever was just tapped. Only open one when nothing was open to
      // begin with. The functional setState form reads the true latest
      // selection at click time regardless of when this closure was
      // created, so `selection` doesn't need to be a dependency here.
      setSelection((current) =>
        current ? null : { type: "location", lngLat: e.lngLat.toArray() as [number, number] },
      );
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [map]);

  // The tapped feature only carries what sightingsToGeoJson put in its
  // properties (id/species/tier/verification/coordinatesObscured/
  // ageBucket, not license/citation/positional uncertainty/photo) —
  // looking the full Sighting up by id from the already-fetched result,
  // rather than widening the GeoJSON properties, keeps that conversion
  // focused on exactly what paint expressions need (see its own doc
  // comment).
  const selectedSighting =
    selection?.type === "sighting" ? (lastData.find((sighting) => sighting.id === selection.id) ?? null) : null;
  const anchor = useProjectedPoint(map, selection?.lngLat ?? null);

  // Two separate refs/pan-triggers, not one shared between both cards:
  // only one of `PinDetailCard`/`SeasonalityCard` is ever actually open
  // (each independently gates on its own prop being non-null), but a
  // single ref can't usefully point at "whichever one is active right
  // now" — passing the same ref object to both `forwardRef` components
  // would just have the second one silently overwrite the first's
  // attachment on every render.
  const pinCardRef = useRef<HTMLDivElement>(null);
  const seasonalityCardRef = useRef<HTMLDivElement>(null);
  usePanCardIntoView(map, pinCardRef, selection?.type === "sighting" ? selection.id : null);
  usePanCardIntoView(
    map,
    seasonalityCardRef,
    selection?.type === "location" ? `${selection.lngLat[0]},${selection.lngLat[1]}` : null,
  );

  return (
    <>
      <PinDetailCard
        ref={pinCardRef}
        sighting={selectedSighting}
        anchor={selection?.type === "sighting" ? anchor : null}
        onClose={() => setSelection(null)}
      />
      <SeasonalityCard
        ref={seasonalityCardRef}
        lngLat={selection?.type === "location" ? selection.lngLat : null}
        date={date}
        anchor={selection?.type === "location" ? anchor : null}
        onClose={() => setSelection(null)}
      />
    </>
  );
}
