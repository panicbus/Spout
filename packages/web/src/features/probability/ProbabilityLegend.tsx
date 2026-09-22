import { COLOR_STOPS } from "../../lib/probabilityRaster.js";
import styles from "./ProbabilityLegend.module.css";

/**
 * Built from the raster's own `COLOR_STOPS`, not a hand-copied gradient —
 * so this can never silently drift out of sync with the colors
 * `buildProbabilityRasterImage` actually paints. Includes each stop's
 * `alpha` (not just its RGB) so the legend itself fades toward
 * transparent at the low end exactly like the map does — otherwise it
 * would show a solid "low" color the map never actually draws.
 */
const GRADIENT = `linear-gradient(to right, ${COLOR_STOPS.map(
  ({ stop, rgb, alpha }) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha}) ${stop * 100}%`,
).join(", ")})`;

/**
 * Explains what the probability layer's colors mean — the layer itself
 * (a raster image) has no way to convey that on its own. Rendered by
 * `ProbabilityLayer` under the same `result.state === "ok"` gate as its
 * model-date stamp, so it never appears while there's no real grid to
 * describe.
 */
export function ProbabilityLegend() {
  return (
    <div className={styles.legend}>
      <p className={styles.title}>Blue whale presence</p>
      <div className={styles.bar} style={{ background: GRADIENT }} />
      <div className={styles.labels}>
        <span>Low</span>
        <span>High</span>
      </div>
      <p className={styles.note}>Modeled likelihood, not a live sighting.</p>
    </div>
  );
}
