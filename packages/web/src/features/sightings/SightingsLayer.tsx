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
import type { FetchState } from "../../lib/useFetch.js";
import spoutMarkerUrl from "../../assets/brand/spout-marker.png";
import { PinDetailCard } from "./PinDetailCard.js";
import { AGE_OPACITY, UNVERIFIED_OPACITY, VERIFIED_MIN_OPACITY, VERIFIED_OPACITY } from "./pinOpacity.js";

export const SIGHTINGS_SOURCE_ID = "sightings";
export const SIGHTINGS_CLUSTERS_LAYER_ID = "sightings-clusters";
export const SIGHTINGS_CLUSTER_COUNT_LAYER_ID = "sightings-cluster-count";
export const SIGHTINGS_POINTS_LAYER_ID = "sightings-points";

/**
 * The invisible (`fill-opacity: 0`) water hit-test layer the app's own
 * composed base style declares (`mapConfig.ts`'s `MAP_STYLE`) — the
 * visible basemap is Esri's raster ocean imagery, which has no vector
 * geometry of its own to query, so this layer exists purely so
 * `queryRenderedFeatures` can still answer "is this tap on water,"
 * sourced from OpenFreeMap's `water` vector layer (OpenMapTiles merges
 * ocean/lake/river under one schema) but rendered fully transparent. See
 * `mapConfig.ts`'s own doc comment for why this needs its own layer
 * rather than reusing OpenFreeMap's full "liberty" style.
 */
export const BASEMAP_WATER_LAYER_ID = "water";

/** The registered `map.addImage` id for the brand marker (`spout-marker.png`) — see the icon-loading effect below for why this has to be a real async load, not a synchronous `addLayer` call like every other layer here. */
export const SIGHTINGS_MARKER_IMAGE_ID = "spout-marker";

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
 * Unclustered individual sightings, rendered with the one brand marker
 * (`spout-marker.png`) for every tier — a deliberate simplification from
 * the earlier per-tier color coding (research/citizen/acoustic each had
 * their own circle color): the user asked for one consistent icon across
 * "all Spout iconography," accepting that trade explicitly after being
 * told it would replace the old tier-color system. Tier is still fully
 * visible in `PinDetailCard` once tapped; it just no longer has its own
 * color on the map itself.
 *
 * `verification`/`coordinatesObscured`/age fade are preserved — spec.md
 * ("clearly marked as unverified photo reports") and ADR 0002
 * ("obscured/geoprivacy coordinates are never rendered as precise pins")
 * both require these to read as visually distinct, and neither is a
 * tier signal, so dropping tier-color didn't have to cost these too.
 * `coordinatesObscured` no longer gets circle-stroke-based softening
 * (icons have no stroke paint property) — just a straightforward size
 * bump instead, a real reduction in that particular affordance, accepted
 * as the cost of switching to a raster icon.
 */
const pointsLayer: AddLayerObject = {
  id: SIGHTINGS_POINTS_LAYER_ID,
  type: "symbol",
  source: SIGHTINGS_SOURCE_ID,
  filter: ["!", ["has", "point_count"]],
  layout: {
    "icon-image": SIGHTINGS_MARKER_IMAGE_ID,
    // The registered source image is 200x189px — sized so these scale
    // factors land on a legible ~38-50px on-screen marker without the
    // underlying raster looking soft even at 2x/retina.
    "icon-size": ["case", ["get", "coordinatesObscured"], 0.26, 0.2],
    // The marker's own artwork has a literal point at its bottom tip
    // (a real map-pin shape) — anchoring there, not at the image center,
    // is what makes that tip land exactly on the sighting's coordinate.
    "icon-anchor": "bottom",
    "icon-allow-overlap": true,
  },
  paint: {
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
    "icon-opacity": [
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

  // `map.addImage` needs real decoded pixel data, which (unlike every
  // other `addLayer` call in this app) means a genuine async load — a
  // freshly-constructed `Map` has no images registered yet, and
  // `pointsLayer` above references `SIGHTINGS_MARKER_IMAGE_ID` by name,
  // so adding it before the icon exists would render nothing for every
  // pin. Gated on `map.loaded()`/`'load'` the same way every other
  // style-mutating call in this codebase is, to avoid mutating a style
  // that isn't ready yet.
  const [iconLoaded, setIconLoaded] = useState(false);
  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    const registerIcon = () => {
      map
        .loadImage(spoutMarkerUrl)
        .then((image) => {
          if (cancelled) return;
          if (!map.hasImage(SIGHTINGS_MARKER_IMAGE_ID)) {
            map.addImage(SIGHTINGS_MARKER_IMAGE_ID, image.data);
          }
          setIconLoaded(true);
        })
        .catch((error: unknown) => {
          console.error("Failed to load the sightings marker icon:", error);
        });
    };

    if (map.loaded()) {
      registerIcon();
    } else {
      map.once("load", registerIcon);
    }

    return () => {
      cancelled = true;
      map.off("load", registerIcon);
    };
  }, [map]);

  // Withholds the real fetch result from `useGeoJsonMapLayer` until the
  // marker icon is registered — its own lifecycle only re-applies when
  // this input's identity/state actually changes, so an "ok" result
  // handed to it before the icon exists would add `pointsLayer`
  // referencing a not-yet-registered image and never revisit it once the
  // icon does load a moment later.
  const layerInput: FetchState<Sighting[]> = iconLoaded ? result : { state: "loading" };

  useGeoJsonMapLayer(map, layerInput, sightingsToGeoJson, {
    sourceId: SIGHTINGS_SOURCE_ID,
    layers: [clustersLayer, clusterCountLayer, pointsLayer],
    // clusterMinPoints: 25 — a grouping only collapses into the numbered
    // cluster bubble once it reaches 25 real sightings; anything smaller
    // renders as individual brand markers instead (a user-requested
    // change: fewer, more legible cluster bubbles, more of the actual
    // marker visible at a glance).
    sourceOptions: { cluster: true, clusterMaxZoom: 14, clusterRadius: 50, clusterMinPoints: 25 },
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
  // (`pointsLayer`'s `icon-opacity`) would silently freeze at whatever
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
  // opens a `SeasonalityCard` for the tapped location — "what am I
  // likely to see here, on this date" for anywhere, not just a sighting
  // pin's own single recorded detail — but only when the tap actually
  // landed on water; a seasonality answer for a point in the middle of a
  // continent isn't a real question, so a land tap is just a dismiss,
  // same as tapping anywhere else that isn't interactive. A
  // layer-scoped listener per case can't express any of this, so this
  // queries the relevant layers at the click point itself and branches
  // on what it finds. Guards each layer id with `getLayer` first —
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

      // Neither a pin nor a cluster was hit. Only open a fresh
      // seasonality card for a water tap, and only when nothing was
      // already open — matching how tapping a dialog's backdrop closes
      // it rather than swapping in a new one. A land tap (or any water
      // tap while a card is already open) is just a dismiss. The
      // functional setState form reads the true latest selection at
      // click time regardless of when this closure was created, so
      // `selection` doesn't need to be a dependency here.
      const isWater = map.getLayer(BASEMAP_WATER_LAYER_ID)
        ? map.queryRenderedFeatures(e.point, { layers: [BASEMAP_WATER_LAYER_ID] }).length > 0
        : false;
      if (!isWater) {
        setSelection(null);
        return;
      }
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
