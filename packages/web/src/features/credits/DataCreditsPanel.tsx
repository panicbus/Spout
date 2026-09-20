import { useState } from "react";
import { Sheet } from "../../components/ui/Sheet.js";
import { useProbabilityGrid } from "../../lib/ProbabilityGridContext.js";
import styles from "./DataCreditsPanel.module.css";

/**
 * ADR 0002 requires NOAA's credit (and its "not associated with NOAA
 * CoastWatch" disclaimer) to "appear in the credits panel" — the
 * publisher name alone already rides along on `ProbabilityLayer`'s
 * stamp, but the full citation/disclaimer/link belongs here. Reads the
 * NOAA citation from `useProbabilityGrid()` (shared via
 * `ProbabilityGridContext` with `ProbabilityLayer`, so this doesn't cost
 * a second network request) rather than hand-copying the text a second
 * time: the API's `sources/whalewatch.ts` is the one place that citation
 * is defined, this just displays whatever it actually served instead of
 * risking a second copy drifting out of sync with it. The loading/error
 * fallback deliberately doesn't hardcode the publisher name itself —
 * that string belongs to the fetched attribution alone.
 */
export function DataCreditsPanel() {
  const [open, setOpen] = useState(false);
  const probability = useProbabilityGrid();

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        Data sources
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Data sources & credits">
        <div className={styles.content}>
          <section>
            <h3>Blue whale probability</h3>
            {probability.state === "ok" ? (
              <>
                <p>
                  {probability.data.attribution.publisherName}
                  {probability.data.attribution.citation ? ` — ${probability.data.attribution.citation}` : ""}
                </p>
                {probability.data.attribution.attributionUrl && (
                  <a href={probability.data.attribution.attributionUrl} target="_blank" rel="noopener noreferrer">
                    About this model
                  </a>
                )}
              </>
            ) : (
              <p>{probability.state === "error" ? "Attribution unavailable right now." : "Loading attribution…"}</p>
            )}
            <p className={styles.note}>
              Model resolution: 0.1° (~11 km) per grid cell — the map is rendered smoothed for readability, but
              never shows real detail finer than the model actually provides.
            </p>
          </section>

          <section>
            <h3>Research &amp; citizen sightings</h3>
            <p>
              Aggregated via GBIF.org (including OBIS-SEAMAP, NOAA IOOS, and other contributing research datasets)
              and iNaturalist&rsquo;s own API for the freshest citizen reports.
            </p>
            <p className={styles.note}>
              Each pin&rsquo;s detail card shows its specific dataset, publisher, and license — licenses vary by
              record, and some restrict commercial use.
            </p>
          </section>

          <section>
            <h3>Map tiles</h3>
            <p>OpenFreeMap, OpenMapTiles, and OpenStreetMap contributors.</p>
          </section>
        </div>
      </Sheet>
    </>
  );
}
