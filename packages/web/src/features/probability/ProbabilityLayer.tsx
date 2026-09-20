import type { AddLayerObject } from "maplibre-gl";
import type { ProbabilityGrid } from "@spout/contracts";
import { useImageMapLayer } from "../../components/map/useImageMapLayer.js";
import { useMap } from "../../components/map/MapContext.js";
import { Stamp } from "../../components/ui/Stamp.js";
import { formatDateStamp } from "../../lib/dateFormat.js";
import { useProbabilityGrid } from "../../lib/ProbabilityGridContext.js";
import { buildProbabilityRasterImage, imageCornersForBbox } from "../../lib/probabilityRaster.js";
import { rasterImageToDataUrl } from "../../lib/rasterImageToDataUrl.js";
import styles from "./ProbabilityLayer.module.css";

export const PROBABILITY_SOURCE_ID = "probability-grid";
export const PROBABILITY_LAYER_ID = "probability-cells";

/**
 * Rasterizes the grid (`probabilityRaster.ts`'s pure pixel math, then
 * `rasterImageToDataUrl`'s one DOM-touching step) into what MapLibre's
 * `image` source needs. The one place the two are composed, so this
 * layer does it exactly once per grid, consistently.
 */
function toImageSource(grid: ProbabilityGrid) {
  return {
    url: rasterImageToDataUrl(buildProbabilityRasterImage(grid)),
    coordinates: imageCornersForBbox(grid.bbox),
  };
}

/**
 * NOT a `heatmap` layer — checked against NOAA's own rendering of this
 * exact date (oceanview.pfeg.noaa.gov/.../output/maps/): `heatmap-density`
 * measures the local clustering of weighted points, not each point's own
 * weight, and over a dense, near-fully-covered 0.1° grid like this one it
 * saturates to "maximum" almost everywhere — solid red along the whole
 * coast, actively misrepresenting data that really ranges 0.016–0.97 with
 * a clear nearshore-high/offshore-low structure.
 *
 * NOT individually-colored `circle` points either (R1-R3's approach) —
 * real user feedback (not a guess) found the raw 0.1° grid (~7x6 miles per
 * cell) too coarse. A CPU-side densify pass (bilinearly interpolating
 * extra points between real cells) was tried first and measured against
 * the live grid: it only gained ~14% more points, because it correctly
 * refused to interpolate across a real nodata gap, and the coastline —
 * exactly where the model's interesting nearshore structure lives — is
 * mostly gap-adjacent, so the technique couldn't help where it mattered
 * most.
 *
 * Instead: the grid is rasterized into an RGBA image (nodata pixels fully
 * transparent, never fabricated) and rendered as a `raster` layer with
 * `raster-resampling: "linear"`, letting the GPU's own bilinear texture
 * sampling do the smoothing when the image is scaled up on screen —
 * mathematically the same interpolation the CPU approach did, just
 * computed per rendered pixel instead of precomputed as extra points, and
 * it blends smoothly right up to a transparent edge instead of refusing
 * to touch it. This needed a real 2D canvas context to rasterize into,
 * which jsdom (this project's unit test environment) doesn't provide
 * without the `canvas` devDependency (`packages/web/package.json`) —
 * added deliberately for this: it's browser-only in production (every
 * real browser already has `HTMLCanvasElement`), so it carries none of
 * R2's `better-sqlite3`/Node 24 native-module runtime risk, only a
 * one-time native build at install time for local test runs.
 *
 * The true model resolution (0.1°) stays honestly disclosed in
 * `DataCreditsPanel` — this is a rendering smoothness improvement, not a
 * claim of finer underlying data.
 */
const probabilityRasterLayer: AddLayerObject = {
  id: PROBABILITY_LAYER_ID,
  type: "raster",
  source: PROBABILITY_SOURCE_ID,
  paint: {
    "raster-resampling": "linear",
    "raster-opacity": 0.8,
  },
};

/**
 * Renders WhaleWatch 2.0's blue-whale probability grid as a smoothed
 * raster image (via `useImageMapLayer` — see its doc comment for the
 * load-gating/lifecycle details this no longer hand-rolls), plus a small
 * stamp naming the model's own date (not today's date — see ADR 0002 on
 * why that distinction matters).
 */
export function ProbabilityLayer() {
  const map = useMap();
  const result = useProbabilityGrid();

  useImageMapLayer(map, result, toImageSource, {
    sourceId: PROBABILITY_SOURCE_ID,
    layers: [probabilityRasterLayer],
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
