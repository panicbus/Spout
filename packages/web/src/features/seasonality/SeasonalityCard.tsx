import { SPECIES_LABELS, type SeasonalityResponse } from "@spout/contracts";
import { forwardRef, useState } from "react";
import { AnchoredCard } from "../../components/ui/AnchoredCard.js";
import type { ProjectedPoint } from "../../components/map/useProjectedPoint.js";
import { useSeasonality } from "../../lib/useSeasonality.js";
import { useSeasonalityYear } from "../../lib/useSeasonalityYear.js";
import { MONTH_NAMES, SPECIES_ICONS, formatShare } from "./seasonalityDisplay.js";
import { YearChart } from "./YearChart.js";
import styles from "./SeasonalityCard.module.css";

/** Highest-share species first, so the most relevant answer to "what am I likely to see" reads first without the user having to scan. */
function bySharesDescending(a: SeasonalityResponse["species"][number], b: SeasonalityResponse["species"][number]) {
  return (b.share ?? -1) - (a.share ?? -1);
}

/** `estimatedDensity` is animals per 100 km² (Duke/NOAA's ECMM habitat models, Phase 4) — an independently modeled figure, deliberately never blended into `formatShare`'s reported-sightings percentage above. */
function formatDensity(density: number): string {
  return `~${density < 1 ? density.toFixed(2) : density.toFixed(1)} modeled / 100 km²`;
}

export interface SeasonalityCardProps {
  /** `null` means nothing is selected — the card renders nothing. */
  lngLat: [number, number] | null;
  /** YYYY-MM-DD — only its calendar month is actually used (see ADR 0006). */
  date: string;
  anchor: ProjectedPoint | null;
  onClose: () => void;
}

/**
 * The tap-anywhere-on-the-map answer to "will I see a whale here, on
 * this date" — an effort-normalized *share* of reported sightings, never
 * presented as an absolute probability (ADR 0006). Distinct from
 * `PinDetailCard`: that one shows a single real historical sighting;
 * this one shows a seasonal pattern computed from many, for wherever the
 * map was tapped, not just where a pin happens to sit.
 */
export const SeasonalityCard = forwardRef<HTMLDivElement, SeasonalityCardProps>(function SeasonalityCard(
  { lngLat, date, anchor, onClose },
  ref,
) {
  const tap = lngLat ? { lat: lngLat[1], lon: lngLat[0], date } : null;
  const result = useSeasonality(tap);
  const open = lngLat !== null;

  // Keyed by the tapped location (not a plain boolean) so switching to a
  // different spot naturally collapses back to the single-month view at
  // render time — the same "derive from a stored key" shape `useSeasonality`
  // itself uses for idle/loading, rather than a separate effect just to
  // reset a boolean on tap change.
  const [yearViewFor, setYearViewFor] = useState<string | null>(null);
  const tapKey = tap ? `${tap.lat},${tap.lon}` : null;
  const showYear = tapKey !== null && yearViewFor === tapKey;
  const yearResult = useSeasonalityYear(showYear && tap ? { lat: tap.lat, lon: tap.lon } : null);

  return (
    <AnchoredCard ref={ref} open={open} anchor={anchor} onClose={onClose} title="Whale sighting seasonality">
      {open && (
        <div className={styles.content}>
          {result.state === "loading" && <p className={styles.status}>Checking reported sightings…</p>}
          {result.state === "error" && (
            <p className={styles.status}>Couldn&rsquo;t load sighting data for this spot right now.</p>
          )}
          {result.state === "ok" && (
            <>
              <h2 className={styles.title}>{MONTH_NAMES[result.data.month - 1]}</h2>
              {result.data.species.every((s) => s.share === undefined) ? (
                <p className={styles.status}>
                  Not enough reported whale sightings near here to say — this doesn&rsquo;t mean whales
                  aren&rsquo;t present, only that few have been reported in this exact spot.
                </p>
              ) : (
                <>
                  <ul className={styles.speciesList}>
                    {[...result.data.species].sort(bySharesDescending).map((s) => (
                      <li key={s.species} className={styles.speciesRow}>
                        <img className={styles.speciesIcon} src={SPECIES_ICONS[s.species]} alt="" />
                        <span className={styles.speciesInfo}>
                          <span className={styles.speciesName}>{SPECIES_LABELS[s.species]}</span>
                          {s.estimatedDensity !== undefined && (
                            <span className={styles.density}>{formatDensity(s.estimatedDensity)}</span>
                          )}
                        </span>
                        <span className={styles.share}>{s.share !== undefined ? formatShare(s.share) : "—"}</span>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.note}>
                    Share of {result.data.species[0]?.sampleSize.toLocaleString()} reported whale sightings
                    near here in {MONTH_NAMES[result.data.month - 1]}, not a chance of seeing one.
                  </p>
                  {result.data.species.some((s) => s.estimatedDensity !== undefined) && (
                    <p className={styles.note}>
                      Modeled density (animals per 100 km²) is from Duke/NOAA&rsquo;s U.S. Atlantic/Gulf habitat
                      models, independent of reported sightings — see Data sources for the citation.
                    </p>
                  )}
                </>
              )}

              <button
                type="button"
                className={styles.yearToggle}
                onClick={() => setYearViewFor(showYear ? null : tapKey)}
                aria-expanded={showYear}
              >
                {showYear ? "Hide full year" : "Show full year"}
              </button>

              {showYear && (
                <>
                  {yearResult.state === "loading" && (
                    <p className={styles.status}>Checking the full year…</p>
                  )}
                  {yearResult.state === "error" && (
                    <p className={styles.status}>Couldn&rsquo;t load the year view for this spot right now.</p>
                  )}
                  {yearResult.state === "ok" && (
                    <YearChart data={yearResult.data} currentMonth={result.data.month} />
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </AnchoredCard>
  );
});
