import { SightingSchema, speciesFromScientificName, type Sighting } from "@spout/contracts";
import { LICENSE_BY_URL } from "./ccLicenses.js";
import { isExcludedDataset } from "./exclusions.js";
import { inaturalistSightingId } from "./inaturalist.js";
import { tierForPublisher } from "./tier.js";

/** The GBIF occurrence-record fields this normalizer actually reads. GBIF's real records carry many more. */
export interface GbifOccurrence {
  key: number;
  scientificName: string;
  decimalLatitude?: number;
  decimalLongitude?: number;
  eventDate?: string;
  datasetKey: string;
  datasetName: string;
  publishingOrgKey: string;
  license?: string;
  /**
   * Passed through as `positionalUncertaintyMeters`, but also used to
   * flag `coordinatesObscured` when it matches GBIF's known ~111km
   * georeferencing-tool placeholder (see `OBSCURED_UNCERTAINTY_THRESHOLD_M`
   * below) — verified against live data during R2.
   */
  coordinateUncertaintyInMeters?: number;
  /** Used only to detect the R3 iNaturalist-dataset de-dup case below — see `INATURALIST_GBIF_DATASET_KEY`. */
  occurrenceID?: string;
}

/**
 * GBIF's "iNaturalist Research-grade Observations" dataset — the same
 * one `tier.ts`'s citizen-tier entry resolves through. Verified live
 * (R3): this dataset's `occurrenceID` reliably embeds
 * `https://www.inaturalist.org/observations/<id>`, where `<id>` is the
 * exact same numeric id iNaturalist's own direct API
 * (`sources/inaturalist.ts`) uses for that observation. That
 * correspondence is what lets `inaturalistIdFromOccurrenceId` below
 * converge both ingestion paths onto one `Sighting.id` for the same
 * real-world observation, so the store's plain upsert-by-id
 * deduplicates them with no separate de-dup pass needed.
 */
const INATURALIST_GBIF_DATASET_KEY = "50c9509d-22c7-4a22-a47d-8c48425ef4a7";
const INATURALIST_OBSERVATION_URL = /^https?:\/\/www\.inaturalist\.org\/observations\/(\d+)$/;

function inaturalistIdFromOccurrenceId(occurrenceID: string | undefined): string | undefined {
  return occurrenceID?.match(INATURALIST_OBSERVATION_URL)?.[1];
}

/**
 * GBIF's `license` field is a full legalcode URL, not the short SPDX-ish
 * code its own search facets use (`CC_BY_NC_4_0`, etc. — verified: the
 * facet and the record field use different formats for the same fact).
 * `LICENSE_BY_URL` (`ccLicenses.ts`) is keyed on the `https://` form
 * (Creative Commons' canonical scheme); `licenseKey` below normalizes an
 * incoming `http://` URL before lookup, since GBIF is inconsistent about
 * the scheme even within one dataset — verified live:
 * `fixtures/gbif/sample-page.json`'s own embedded multimedia metadata
 * uses `https://` for a record whose top-level `license` field uses
 * `http://` for the same license.
 * A license URL not in that map is treated as unknown, not guessed at —
 * see `normalizeGbifRecord`'s drop-on-unknown-license behavior below.
 */
function licenseKey(url: string): string {
  return url.replace(/^http:\/\//, "https://");
}

/**
 * GBIF records with coordinate uncertainty at or above this land squarely
 * on the known ~111,319.49m (≈1° of latitude) georeferencing-tool
 * placeholder — a strong signal the coordinate was deliberately
 * randomized/generalized (e.g. iNaturalist geoprivacy passed through
 * GBIF), not measured. A small margin below the exact value guards
 * against floating-point formatting differences across records.
 */
const OBSCURED_UNCERTAINTY_THRESHOLD_M = 100_000;

/**
 * Converts one raw GBIF occurrence record into a `Sighting`, or `null` if
 * the record should be dropped entirely. Every drop condition is a
 * deliberate "we don't know enough to trust this record" case, not a
 * best-effort guess:
 *
 * - SanctSound (ADR 0002's dataset exclusion)
 * - publisher not on the tiering allowlist (`tier.ts`)
 * - species outside the four this app tracks
 * - missing coordinates
 * - license not in the known set (never default to "presumably fine to reuse")
 * - fails final schema validation (e.g. a Darwin Core `eventDate`
 *   *interval* like `"1990-01-01/1990-06-30"` — a real, legitimate GBIF
 *   format for imprecise historical records, which `Date.parse` can't
 *   handle and the schema's `isoDateTimeString` refine correctly
 *   rejects; or a negative uncertainty). This is caught here rather than
 *   left to throw, specifically so one malformed record can't abort an
 *   entire refresh — see `sources/gbif.ts` for what depends on that.
 *
 * `verification` defaults to `"verified"` for every tier reachable by
 * this pipeline today, including citizen: the only `citizen`-tiered
 * publisher (`tier.ts`'s iNaturalist.org entry) resolves entirely
 * through GBIF's "iNaturalist Research-grade Observations" dataset,
 * whose own published description states every record in it "Achieved
 * one of following iNaturalist quality grades: Research" — verified
 * live against GBIF's dataset metadata during R2's review. iNaturalist's
 * `needs_id`/`casual` records are pre-filtered out before they ever
 * reach this dataset, so they don't exist in this pipeline at all; R3's
 * direct iNaturalist ingestion is where those states *first appear* in
 * Spout, not where citizen verification "becomes real" for data that
 * already carries it.
 */
export function normalizeGbifRecord(record: GbifOccurrence): Sighting | null {
  if (isExcludedDataset(record.datasetKey)) return null;

  const publisher = tierForPublisher(record.publishingOrgKey);
  if (!publisher) return null;

  const species = speciesFromScientificName(record.scientificName);
  if (!species) return null;

  if (record.decimalLatitude === undefined || record.decimalLongitude === undefined) return null;

  const license = record.license ? LICENSE_BY_URL[licenseKey(record.license)] : undefined;
  if (!license) return null;

  if (!record.eventDate) return null;

  // Converge onto R3's iNaturalist id/sourceApi for this one specific
  // dataset (see INATURALIST_GBIF_DATASET_KEY's doc comment) — falls
  // back to the ordinary gbif:<key> id when occurrenceID is missing or
  // doesn't match the expected shape, rather than dropping the record.
  const inaturalistId =
    record.datasetKey === INATURALIST_GBIF_DATASET_KEY
      ? inaturalistIdFromOccurrenceId(record.occurrenceID)
      : undefined;

  const candidate = {
    id: inaturalistId ? inaturalistSightingId(inaturalistId) : `gbif:${record.key}`,
    species,
    lat: record.decimalLatitude,
    lon: record.decimalLongitude,
    observedAt: record.eventDate,
    tier: publisher.tier,
    sourceApi: inaturalistId ? ("inaturalist" as const) : ("gbif" as const),
    verification: "verified" as const,
    coordinatesObscured:
      record.coordinateUncertaintyInMeters !== undefined &&
      record.coordinateUncertaintyInMeters >= OBSCURED_UNCERTAINTY_THRESHOLD_M,
    positionalUncertaintyMeters: record.coordinateUncertaintyInMeters,
    attribution: {
      datasetName: record.datasetName,
      datasetId: record.datasetKey,
      publisherName: publisher.publisherName,
      publisherId: record.publishingOrgKey,
      license,
    },
  };

  const result = SightingSchema.safeParse(candidate);
  if (!result.success) {
    // Unlike the drop conditions above (routine, expected, silent by
    // design), a schema-validation failure here means the candidate
    // passed every check this function knows about and still didn't fit
    // the shared contract — worth a log line, since it's the signal that
    // GBIF sent something this normalizer hasn't seen before.
    console.warn(`normalizeGbifRecord: dropping ${candidate.id}, failed schema validation:`, result.error.message);
    return null;
  }
  return result.data;
}
