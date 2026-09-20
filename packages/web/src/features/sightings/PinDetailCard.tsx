import { SPECIES_LABELS, type Sighting, type SourceTier } from "@spout/contracts";
import { Badge, type BadgeTone } from "../../components/ui/Badge.js";
import { Sheet } from "../../components/ui/Sheet.js";
import { formatObservedAt } from "../../lib/dateFormat.js";
import { seasonalityNote } from "../../lib/seasonality.js";
import styles from "./PinDetailCard.module.css";

const TIER_LABELS: Record<SourceTier, string> = {
  research: "Research-grade",
  citizen: "Citizen report",
  acoustic: "Acoustic station",
};

const TIER_TONES: Record<SourceTier, BadgeTone> = {
  research: "ok",
  citizen: "neutral",
  acoustic: "neutral",
};

/** `meters` as a short, human string — kilometers past a point where "meters" stops being a meaningful precision claim. */
function formatUncertainty(meters: number): string {
  if (meters >= 1000) return `±${(meters / 1000).toFixed(1)} km`;
  return `±${Math.round(meters)} m`;
}

export interface PinDetailCardProps {
  /** `null` means nothing is selected — the card renders nothing (not an empty sheet). */
  sighting: Sighting | null;
  onClose: () => void;
}

/**
 * The tap-to-detail card spec.md/the build plan call for: species, date,
 * source, and license on every sighting pin. Wraps the one shared `Sheet`
 * primitive (also used by `DataCreditsPanel`) rather than a bespoke
 * overlay. `sighting: null` (nothing selected) and `sighting: Sighting`
 * (a real tap) are both handled by this one component — the caller
 * (`SightingsLayer`) doesn't need its own `open` boolean in sync with a
 * separate selected-sighting value.
 */
export function PinDetailCard({ sighting, onClose }: PinDetailCardProps) {
  return (
    <Sheet open={sighting !== null} onClose={onClose} title={sighting ? SPECIES_LABELS[sighting.species] : undefined}>
      {sighting && (
        <div className={styles.content}>
          <div className={styles.badges}>
            <Badge tone={TIER_TONES[sighting.tier]} label={TIER_LABELS[sighting.tier]} />
            <Badge
              tone={sighting.verification === "verified" ? "ok" : "warning"}
              label={sighting.verification === "verified" ? "Verified" : "Unverified — needs ID"}
            />
          </div>

          <p className={styles.date}>Observed {formatObservedAt(sighting.observedAt)}</p>

          {/* When obscured, `positionalUncertaintyMeters` is the
              geoprivacy obfuscation radius (e.g. GBIF's own
              coordinateUncertaintyInMeters, which is set to that radius
              specifically because the record's coordinate is
              deliberately randomized — see normalize/sighting.ts), not a
              genuine measurement/GPS precision figure. Folded into the
              one "location approximate" note rather than shown as its
              own "Position accuracy" line, so it never reads as a
              precision claim it isn't. */}
          {sighting.coordinatesObscured ? (
            <p className={styles.note}>
              Location approximate — coordinates randomized to protect this species
              {sighting.positionalUncertaintyMeters !== undefined
                ? ` (true location is within ${formatUncertainty(sighting.positionalUncertaintyMeters)} of the pin).`
                : "."}
            </p>
          ) : (
            sighting.positionalUncertaintyMeters !== undefined && (
              <p className={styles.note}>
                Position accuracy: {formatUncertainty(sighting.positionalUncertaintyMeters)}
              </p>
            )
          )}

          {seasonalityNote(sighting.species) && (
            <p className={styles.note}>{seasonalityNote(sighting.species)}</p>
          )}

          <div className={styles.attribution}>
            <p>
              {sighting.attribution.datasetName} via {sighting.attribution.publisherName}
            </p>
            {sighting.attribution.citation && <p className={styles.citation}>{sighting.attribution.citation}</p>}
            <p>
              License:{" "}
              {sighting.attribution.license.url ? (
                <a href={sighting.attribution.license.url} target="_blank" rel="noopener noreferrer">
                  {sighting.attribution.license.id}
                </a>
              ) : (
                sighting.attribution.license.id
              )}
            </p>
            {sighting.attribution.attributionUrl && (
              <a href={sighting.attribution.attributionUrl} target="_blank" rel="noopener noreferrer">
                View original observation
              </a>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
