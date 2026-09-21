import { SightingSchema, speciesFromScientificName, type Sighting } from "@spout/contracts";
import { LICENSE_BY_CODE } from "./ccLicenses.js";

/** The iNaturalist observation fields this normalizer actually reads. Real responses carry many more (annotations, full user profile, etc.). */
export interface INaturalistObservation {
  id: number;
  taxon: { name: string } | null;
  quality_grade: "research" | "needs_id" | "casual";
  observed_on: string | null;
  /** Has a real UTC offset, unlike GBIF's naive `eventDate` — preferred over `observed_on` when present. */
  time_observed_at: string | null;
  license_code: string | null;
  /** Ground truth, unlike GBIF's inferred ~111km-uncertainty heuristic (see normalize/sighting.ts). */
  obscured: boolean;
  /** `"lat,lon"` — iNaturalist's own format, distinct from GeoJSON's `[lon,lat]` order. */
  location: string | null;
  /**
   * The publicly-visible accuracy radius. Deliberately NOT `positional_accuracy`
   * (the true, un-obscured radius) — using the true value for an obscured
   * observation would leak exactly the precision geoprivacy exists to hide.
   */
  public_positional_accuracy: number | null;
  positional_accuracy?: number | null;
  user?: { login: string } | null;
  uri: string;
  /** iNaturalist always serves this as a 75px "square" thumbnail — see `upgradePhotoSize` below for why the card doesn't use it directly. */
  photos?: { url: string }[];
}

/**
 * iNaturalist's `photos[].url` is always the 75px "square" thumbnail
 * variant; swapping the filename for "medium" (500px, still a real,
 * always-available size per iNaturalist's own photo-serving convention —
 * verified against the live fixture) gets a real detail-card-sized image
 * from the same photo without a second API call.
 */
function upgradePhotoSize(url: string): string {
  return url.replace(/\/square(\.\w+)$/, "/medium$1");
}

/**
 * `null`/unrecognized `license_code` means either no license was set (all
 * rights reserved) or a variant this project's `LICENSE_BY_CODE`
 * (`ccLicenses.ts`) doesn't know about — either way the record is
 * dropped, same as GBIF's unknown-license handling, never guessed at.
 */

/**
 * `location` is `"lat,lon"` with no separator whitespace tolerance
 * needed (verified live: iNaturalist's own format never includes it) —
 * but a missing half (`"36.5,"`) must be rejected, not coerced: plain
 * `Number("")` is `0`, not `NaN`, so an empty component has to be caught
 * explicitly before the numeric parse, or a malformed location would
 * silently become a real (wrong) coordinate — lon 0 — instead of being
 * dropped.
 */
function parseLocation(location: string): { lat: number; lon: number } | null {
  const parts = location.split(",");
  if (parts.length !== 2 || parts.some((part) => part.trim() === "")) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

/**
 * The one place both ingestion paths' id format is defined — imported by
 * `normalize/sighting.ts` for its GBIF-iNaturalist-dataset de-dup
 * convergence, specifically so the two paths can never drift apart on
 * how they format the same observation's id (which would silently break
 * de-dup: the same real-world observation would start appearing as two
 * separate rows with no error).
 */
export function inaturalistSightingId(id: number | string): string {
  return `inaturalist:${id}`;
}

/**
 * Converts one raw iNaturalist observation into a `Sighting`, or `null`
 * if it should be dropped:
 *
 * - `quality_grade: "casual"` — no location/evidence requirement met,
 *   per ADR 0002's decision (documented on `VerificationStatusSchema`
 *   in `packages/contracts`): only `research` and `needs_id` reach
 *   Spout at all.
 * - missing taxon, unsupported species, missing/unparseable location,
 *   or an unrecognized/missing license — same "don't guess" philosophy
 *   as `normalizeGbifRecord`.
 *
 * Sets `tier: "citizen"` unconditionally — this endpoint only ever
 * represents iNaturalist's own citizen-science observations, never
 * research-tier data (unlike the GBIF pipeline, which sees multiple
 * publisher tiers through one API).
 */
export function normalizeINaturalistObservation(obs: INaturalistObservation): Sighting | null {
  if (obs.quality_grade === "casual") return null;
  if (!obs.taxon) return null;

  const species = speciesFromScientificName(obs.taxon.name);
  if (!species) return null;

  if (!obs.location) return null;
  const coords = parseLocation(obs.location);
  if (!coords) return null;

  const license = obs.license_code ? LICENSE_BY_CODE[obs.license_code] : undefined;
  if (!license) return null;

  const observedAt = obs.time_observed_at ?? obs.observed_on;
  if (!observedAt) return null;

  const candidate = {
    id: inaturalistSightingId(obs.id),
    species,
    lat: coords.lat,
    lon: coords.lon,
    observedAt,
    tier: "citizen" as const,
    sourceApi: "inaturalist" as const,
    verification: obs.quality_grade === "research" ? ("verified" as const) : ("unverified" as const),
    coordinatesObscured: obs.obscured,
    positionalUncertaintyMeters: obs.public_positional_accuracy ?? undefined,
    photoUrl: obs.photos?.[0] ? upgradePhotoSize(obs.photos[0].url) : undefined,
    attribution: {
      datasetName: "Observation",
      datasetId: "inaturalist-api-direct",
      publisherName: "iNaturalist.org",
      publisherId: "inaturalist.org",
      // The direct link to this specific observation — more useful here
      // than a project-level URL (how whalewatch.ts uses this same
      // field), since a future detail card (R4) can link straight to it.
      attributionUrl: obs.uri,
      license,
    },
  };

  const result = SightingSchema.safeParse(candidate);
  if (!result.success) {
    console.warn(
      `normalizeINaturalistObservation: dropping ${candidate.id}, failed schema validation:`,
      result.error.message,
    );
    return null;
  }
  return result.data;
}
