import { SPECIES_LABELS, type Sighting, type Species, type SourceTier } from "@spout/contracts";
import { forwardRef } from "react";
import { AnchoredCard } from "../../components/ui/AnchoredCard.js";
import type { ProjectedPoint } from "../../components/map/useProjectedPoint.js";
import { Badge, type BadgeTone } from "../../components/ui/Badge.js";
import blueWhaleIcon from "../../assets/species/blue-whale.png";
import grayWhaleIcon from "../../assets/species/gray-whale.png";
import humpbackWhaleIcon from "../../assets/species/humpback-whale.png";
import orcaIcon from "../../assets/species/orca.png";
import { formatObservedAt } from "../../lib/dateFormat.js";
import { seasonalityNote } from "../../lib/seasonality.js";
import styles from "./PinDetailCard.module.css";

/**
 * User-supplied illustrations, not this project's own hand-drawn SVG
 * attempts — those didn't hold up at real card size after two review
 * rounds. Cropped per-species (connected-component isolation, not a
 * blind rectangle — some tails/fins crossed the source sheet's grid
 * lines) from the user's own ChatGPT-generated reference sheet, with the
 * white background keyed to transparent.
 */
const SPECIES_ICONS: Record<Species, string> = {
  "blue-whale": blueWhaleIcon,
  "humpback-whale": humpbackWhaleIcon,
  "gray-whale": grayWhaleIcon,
  orca: orcaIcon,
};

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
 * Forwards `ref` through to `AnchoredCard`'s root element — `SightingsLayer`
 * uses it (via `usePanCardIntoView`) to measure the real rendered card and
 * pan the map so the whole thing ends up inside the viewport, not just the
 * anchor point.
 */
export const PinDetailCard = forwardRef<HTMLDivElement, PinDetailCardProps>(function PinDetailCard(
  { sighting, anchor, onClose },
  ref,
) {
  return (
    <AnchoredCard
      ref={ref}
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

          <div className={styles.body}>
            <div className={styles.titleRow}>
              <img className={styles.speciesIcon} src={SPECIES_ICONS[sighting.species]} alt="" />
              <h2 className={styles.title}>{SPECIES_LABELS[sighting.species]}</h2>
            </div>

            <div className={styles.badges}>
              <Badge tone={TIER_TONES[sighting.tier]} label={TIER_LABELS[sighting.tier]} />
              <Badge
                tone={sighting.verification === "verified" ? "ok" : "warning"}
                label={sighting.verification === "verified" ? "Verified" : "Unverified — needs ID"}
              />
            </div>

            <dl className={styles.meta}>
              <div className={styles.metaRow}>
                <dt>observed</dt>
                <dd>{formatObservedAt(sighting.observedAt)}</dd>
              </div>
              {/* When obscured, `positionalUncertaintyMeters` is the
                  geoprivacy obfuscation radius (e.g. GBIF's own
                  coordinateUncertaintyInMeters, which is set to that radius
                  specifically because the record's coordinate is
                  deliberately randomized — see normalize/sighting.ts), not a
                  genuine measurement/GPS precision figure. Kept out of this
                  label/value list (which reads as measured facts) and folded
                  into the "location approximate" note below instead, so it
                  never reads as a precision claim it isn't. */}
              {!sighting.coordinatesObscured && sighting.positionalUncertaintyMeters !== undefined && (
                <div className={styles.metaRow}>
                  <dt>accuracy</dt>
                  <dd>{formatUncertainty(sighting.positionalUncertaintyMeters)}</dd>
                </div>
              )}
            </dl>

            {sighting.coordinatesObscured && (
              <p className={styles.note}>
                Location approximate — coordinates randomized to protect this species
                {sighting.positionalUncertaintyMeters !== undefined
                  ? ` (true location is within ${formatUncertainty(sighting.positionalUncertaintyMeters)} of the pin).`
                  : "."}
              </p>
            )}

            {seasonalityNote(sighting.species) && (
              <p className={styles.note}>{seasonalityNote(sighting.species)}</p>
            )}

            {sighting.attribution.citation && <p className={styles.citation}>{sighting.attribution.citation}</p>}

            <div className={styles.divider} aria-hidden="true" />

            <p className={styles.footer}>
              {sighting.attribution.datasetName} via {sighting.attribution.publisherName}
              {sighting.attribution.attributionUrl && (
                <>
                  {" ("}
                  <a href={sighting.attribution.attributionUrl} target="_blank" rel="noopener noreferrer">
                    view original
                  </a>
                  {")"}
                </>
              )}
              {" · License "}
              {sighting.attribution.license.url ? (
                <a href={sighting.attribution.license.url} target="_blank" rel="noopener noreferrer">
                  {sighting.attribution.license.id}
                </a>
              ) : (
                sighting.attribution.license.id
              )}
            </p>
          </div>
        </div>
      )}
    </AnchoredCard>
  );
});
