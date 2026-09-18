import type { AddLayerObject } from "maplibre-gl";
import { useGeoJsonMapLayer } from "../../components/map/useGeoJsonMapLayer.js";
import { useMap } from "../../components/map/MapContext.js";
import { Stamp } from "../../components/ui/Stamp.js";
import { formatDateStamp } from "../../lib/dateFormat.js";
import { gridToGeoJson } from "../../lib/probabilityGeoJson.js";
import { useProbabilityGrid } from "../../lib/useProbabilityGrid.js";
import styles from "./ProbabilityLayer.module.css";

export const PROBABILITY_SOURCE_ID = "probability-grid";
export const PROBABILITY_LAYER_ID = "probability-cells";

/**
 * Colors each cell directly by its own `probability` value.
 *
 * NOT a `heatmap` layer, on purpose, after checking the result against
 * NOAA's own rendering of this exact date
 * (oceanview.pfeg.noaa.gov/.../output/maps/): `heatmap-density` measures
 * the local clustering of weighted points, not the point's own weight —
 * over a dense, near-fully-covered 0.1° grid like this one, density
 * saturates to "maximum" across almost the entire ocean regardless of
 * each cell's actual probability, which rendered as solid red along the
 * whole coast and actively misrepresented the data (the real values
 * range 0.016–0.97 with a clear nearshore-high/offshore-low structure —
 * exactly what NOAA's own map shows and what a `heatmap` layer erased).
 * The blue→red ramp mirrors NOAA's own color scale for the same reason:
 * comparability, not just style.
 */
const probabilityCellsLayer: AddLayerObject = {
  id: PROBABILITY_LAYER_ID,
  type: "circle",
  source: PROBABILITY_SOURCE_ID,
  paint: {
    "circle-color": [
      "interpolate",
      ["linear"],
      ["get", "probability"],
      0,
      "#1b1464",
      0.2,
      "royalblue",
      0.4,
      "cyan",
      0.6,
      "lime",
      0.8,
      "yellow",
      1,
      "red",
    ],
    // Radius grows with zoom so 0.1deg cells read as a near-continuous
    // surface rather than isolated dots or gaps at any reasonable zoom;
    // exact tuning (and whether a smoother surface is worth switching to
    // a raster/image source instead) is left to R4's UX pass.
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 8, 14],
    "circle-blur": 0.6,
    "circle-opacity": 0.8,
  },
};

/**
 * Renders WhaleWatch 2.0's blue-whale probability grid as colored map
 * cells (via `useGeoJsonMapLayer` — see its doc comment for the
 * load-gating/lifecycle details this no longer hand-rolls), plus a small
 * stamp naming the model's own date (not today's date — see ADR 0002 on
 * why that distinction matters).
 */
export function ProbabilityLayer() {
  const map = useMap();
  const result = useProbabilityGrid();

  useGeoJsonMapLayer(map, result, gridToGeoJson, {
    sourceId: PROBABILITY_SOURCE_ID,
    layers: [probabilityCellsLayer],
  });

  if (result.state !== "ok") return null;

  // ADR 0002 requires NOAA's credit to "appear in the credits panel" —
  // the full panel (with citation, license, per-source detail) is R4
  // scope, but the credit itself can't be invisible until then, so the
  // publisher name rides along on the one piece of UI this layer already
  // renders rather than waiting.
  const { publisherName } = result.data.attribution;

  return (
    <div className={styles.stampWrapper}>
      <Stamp>
        Blue whale probability — {publisherName}, {formatDateStamp(result.data.modelDate)}
      </Stamp>
    </div>
  );
}
