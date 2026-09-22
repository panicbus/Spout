import { SPECIES_LABELS, type SeasonalityResponse, type Species } from "@spout/contracts";
import { forwardRef } from "react";
import { AnchoredCard } from "../../components/ui/AnchoredCard.js";
import type { ProjectedPoint } from "../../components/map/useProjectedPoint.js";
import { useSeasonality } from "../../lib/useSeasonality.js";
import blueWhaleIcon from "../../assets/species/blue-whale.png";
import grayWhaleIcon from "../../assets/species/gray-whale.png";
import humpbackWhaleIcon from "../../assets/species/humpback-whale.png";
import orcaIcon from "../../assets/species/orca.png";
import styles from "./SeasonalityCard.module.css";

const SPECIES_ICONS: Record<Species, string> = {
  "blue-whale": blueWhaleIcon,
  "humpback-whale": humpbackWhaleIcon,
  "gray-whale": grayWhaleIcon,
  orca: orcaIcon,
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Highest-share species first, so the most relevant answer to "what am I likely to see" reads first without the user having to scan. */
function bySharesDescending(a: SeasonalityResponse["species"][number], b: SeasonalityResponse["species"][number]) {
  return (b.share ?? -1) - (a.share ?? -1);
}

function formatShare(share: number): string {
  if (share === 0) return "not reported";
  if (share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
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
                        <span className={styles.speciesName}>{SPECIES_LABELS[s.species]}</span>
                        <span className={styles.share}>{s.share !== undefined ? formatShare(s.share) : "—"}</span>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.note}>
                    Share of {result.data.species[0]?.sampleSize.toLocaleString()} reported whale sightings
                    near here in {MONTH_NAMES[result.data.month - 1]}, not a chance of seeing one.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}
    </AnchoredCard>
  );
});
