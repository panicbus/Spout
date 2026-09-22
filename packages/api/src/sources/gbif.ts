import { CA_COAST_BBOX, SPECIES, SPECIES_SCIENTIFIC_NAMES, type Bbox, type Sighting } from "@spout/contracts";
import { z } from "zod";
import { normalizeGbifRecord, type GbifOccurrence } from "../normalize/sighting.js";
import { fetchWithBackoff, type FetchWithBackoffOptions } from "./http.js";

export const GBIF_SEARCH_URL = "https://api.gbif.org/v1/occurrence/search";
/** GBIF's documented maximum page size. */
const PAGE_LIMIT = 300;
/** GBIF hard-errors (HTTP 400) past this offset. A bounded date range (see `fetchGbifSightings`) keeps real per-species counts far below it; this is a safety net against ever looping past it. */
const MAX_OFFSET = 100_000;

/**
 * Every other external payload in this codebase gets `Schema.parse`'d
 * before it's trusted (see `sources/whalewatch.ts`'s own house
 * convention) — the GBIF page envelope is no exception. Deliberately
 * loose: only the two fields this module actually reads
 * (`endOfRecords`, `results`). Individual records within `results` are
 * NOT validated here — `normalizeGbifRecord` already safely handles a
 * malformed individual record by dropping it, so re-validating the
 * envelope's contents here would just duplicate that work.
 */
const GbifPageSchema = z.object({
  endOfRecords: z.boolean(),
  results: z.array(z.unknown()),
});

async function fetchSpeciesSightings(
  scientificName: string,
  bbox: Bbox,
  sinceDate: string,
  untilDate: string,
  fetchImpl: typeof fetch,
  backoffOptions: Omit<FetchWithBackoffOptions, "fetchImpl">,
): Promise<Sighting[]> {
  const sightings: Sighting[] = [];
  let offset = 0;
  const [minLon, minLat, maxLon, maxLat] = bbox;

  for (;;) {
    if (offset > MAX_OFFSET) {
      throw new Error(
        `GBIF pagination for "${scientificName}" exceeded the safety offset limit (${MAX_OFFSET}) — the date range is probably too wide`,
      );
    }

    const params = new URLSearchParams({
      scientificName,
      decimalLatitude: `${minLat},${maxLat}`,
      decimalLongitude: `${minLon},${maxLon}`,
      hasCoordinate: "true",
      eventDate: `${sinceDate},${untilDate}`,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    const url = `${GBIF_SEARCH_URL}?${params.toString()}`;

    const response = await fetchWithBackoff(url, { fetchImpl, ...backoffOptions });
    if (!response.ok) {
      throw new Error(`GBIF fetch failed (${response.status}) for "${scientificName}" at offset ${offset}`);
    }

    const page = GbifPageSchema.parse(await response.json());
    for (const record of page.results) {
      const sighting = normalizeGbifRecord(record as GbifOccurrence);
      if (sighting) sightings.push(sighting);
    }

    if (page.endOfRecords || page.results.length === 0) break;
    offset += page.results.length;
  }

  return sightings;
}

export interface FetchGbifSightingsOptions {
  /** YYYY-MM-DD — the start of the ingestion window. */
  sinceDate: string;
  /** YYYY-MM-DD — defaults to today. */
  untilDate?: string;
  /** Defaults to `CA_COAST_BBOX` — the persistent refresh pipeline (`sightingsRefresh.ts`) never overrides this; only the on-demand global path (`store/globalSightingsCache.ts`) does. */
  bbox?: Bbox;
  fetchImpl?: typeof fetch;
  /** Overridable for tests, so retry backoff doesn't actually wait — see `fetchWithBackoff`. */
  backoffDelayMs?: FetchWithBackoffOptions["delayMs"];
}

/**
 * Fetches, paginates, and normalizes GBIF occurrence records for all
 * four tracked species within `[sinceDate, untilDate]` and `bbox`.
 * Queries run per-species in parallel — GBIF has no way to query
 * multiple scientific names in one request.
 *
 * Uses `Promise.allSettled`, not `Promise.all`: one species failing
 * (a persistent network error, a malformed response envelope, the
 * offset safety net tripping) must not discard the other three species'
 * already-successfully-fetched sightings. A failed species is logged
 * and simply contributes nothing to this refresh cycle; it gets another
 * chance next refresh.
 */
export async function fetchGbifSightings({
  sinceDate,
  untilDate = new Date().toISOString().slice(0, 10),
  bbox = CA_COAST_BBOX,
  fetchImpl = fetch,
  backoffDelayMs,
}: FetchGbifSightingsOptions): Promise<Sighting[]> {
  const settled = await Promise.allSettled(
    SPECIES.map((species) =>
      fetchSpeciesSightings(
        SPECIES_SCIENTIFIC_NAMES[species],
        bbox,
        sinceDate,
        untilDate,
        fetchImpl,
        backoffDelayMs ? { delayMs: backoffDelayMs } : {},
      ),
    ),
  );

  const sightings: Sighting[] = [];
  for (const [index, result] of settled.entries()) {
    if (result.status === "fulfilled") {
      sightings.push(...result.value);
    } else {
      console.error(`fetchGbifSightings: "${SPECIES[index]}" failed this refresh cycle:`, result.reason);
    }
  }
  return sightings;
}
