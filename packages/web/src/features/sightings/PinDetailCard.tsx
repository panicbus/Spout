import { SPECIES_LABELS, type Sighting, type SourceTier } from "@spout/contracts";
import { AnchoredCard } from "../../components/ui/AnchoredCard.js";
import type { ProjectedPoint } from "../../components/map/useProjectedPoint.js";
import { Badge, type BadgeTone } from "../../components/ui/Badge.js";
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
  /** `null` means nothing is selected — the card renders nothing. */
  sighting: Sighting | null;
  /** Where the tapped pin currently sits on screen — `null` while unresolved (map not yet loaded, or nothing selected). */
  anchor: ProjectedPoint | null;
  onClose: () => void;
}

/**
 * The tap-to-detail card spec.md/the build plan call for: species, date,
 * source, and license on every sighting pin. An `AnchoredCard` (pinned to
 * the tapped feature with a connecting arrow, not a full-width bottom
 * sheet — R4c) rather than a bespoke overlay. `sighting: null` (nothing
 * selected) and `sighting: Sighting` (a real tap) are both handled by
 * this one component — the caller (`SightingsLayer`) doesn't need its
 * own `open` boolean in sync with a separate selected-sighting value.
 *
 * The top-left species icon slot is deliberately unpopulated for now —
 * pending a real icon set the user is reviewing separately; wiring one
 * in prematurely would mean redoing this layout twice.
 */
export function PinDetailCard({ sighting, anchor, onClose }: PinDetailCardProps) {
  return (
    <AnchoredCard
      open={sighting !== null}
      anchor={anchor}
      onClose={onClose}
      title={sighting ? SPECIES_LABELS[sighting.species] : undefined}
    >
      {sighting && (
        <div className={styles.content}>
          {sighting.photoUrl && (
            <img
              className={styles.photo}
              src={sighting.photoUrl}
              alt={`${SPECIES_LABELS[sighting.species]} sighting photo`}
            />
          )}

          <h2 className={styles.title}>{SPECIES_LABELS[sighting.species]}</h2>

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
            {sighting.attribution.attributionUrl && (
              <a href={sighting.attribution.attributionUrl} target="_blank" rel="noopener noreferrer">
                View original observation
              </a>
            )}
          </div>

          <p className={styles.license}>
            License:{" "}
            {sighting.attribution.license.url ? (
              <a href={sighting.attribution.license.url} target="_blank" rel="noopener noreferrer">
                {sighting.attribution.license.id}
              </a>
            ) : (
              sighting.attribution.license.id
            )}
          </p>
        </div>
      )}
    </AnchoredCard>
  );
}
