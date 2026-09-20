import type { AddLayerObject, MapGeoJSONFeature } from "maplibre-gl";
import type { Sighting, TimeWindow } from "@spout/contracts";
import { useCallback, useState } from "react";
import { useMap } from "../../components/map/MapContext.js";
import { useGeoJsonMapLayer } from "../../components/map/useGeoJsonMapLayer.js";
import { useLayerClick } from "../../components/map/useLayerClick.js";
import { sightingsToGeoJson } from "../../lib/sightingsGeoJson.js";
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
    // a precise pin.
    "circle-radius": ["case", ["get", "coordinatesObscured"], 11, 6],
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
 * Deliberately does not fetch by map viewport bbox yet — the API already
 * scopes ingestion to the California coast bbox, so an unfiltered fetch
 * is the whole dataset for v1's geographic scope.
 */
export interface SightingsLayerProps {
  timeWindow: TimeWindow;
}

export function SightingsLayer({ timeWindow }: SightingsLayerProps) {
  const map = useMap();
  const result = useSightings({ window: timeWindow });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastData, setLastData] = useState<Sighting[]>([]);

  useGeoJsonMapLayer(map, result, sightingsToGeoJson, {
    sourceId: SIGHTINGS_SOURCE_ID,
    layers: [clustersLayer, clusterCountLayer, pointsLayer],
    sourceOptions: { cluster: true, clusterMaxZoom: 14, clusterRadius: 50 },
  });

  // `useMapLayerLifecycle` deliberately leaves the previously-rendered
  // pins on screen (and clickable) for the full duration of a refetch —
  // see its own doc comment. Resolving `selectedId` against the last
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

  // The tapped feature only carries what sightingsToGeoJson put in its
  // properties (id/species/tier/verification/coordinatesObscured/
  // ageBucket, not license/citation/positional uncertainty) — looking the
  // full Sighting up by id from the already-fetched result, rather than
  // widening the GeoJSON properties, keeps that conversion focused on
  // exactly what paint expressions need (see its own doc comment).
  const handleFeatureClick = useCallback((feature: MapGeoJSONFeature) => {
    setSelectedId((feature.properties?.id as string | undefined) ?? null);
  }, []);

  useLayerClick(map, SIGHTINGS_POINTS_LAYER_ID, handleFeatureClick);

  const selected = selectedId ? (lastData.find((sighting) => sighting.id === selectedId) ?? null) : null;

  return <PinDetailCard sighting={selected} onClose={() => setSelectedId(null)} />;
}
