import { CA_COAST_BBOX, SPECIES, SPECIES_SCIENTIFIC_NAMES, type Sighting } from "@spout/contracts";
import { z } from "zod";
import {
  normalizeINaturalistObservation,
  type INaturalistObservation,
} from "../normalize/inaturalist.js";
import { fetchWithBackoff, type FetchWithBackoffOptions } from "./http.js";

export const INATURALIST_SEARCH_URL = "https://api.inaturalist.org/v1/observations";
const [minLon, minLat, maxLon, maxLat] = CA_COAST_BBOX;
/** iNaturalist's documented maximum page size. */
const PAGE_LIMIT = 200;
/**
 * Safety net mirroring `sources/gbif.ts`'s `MAX_OFFSET` for the same
 * class of risk: real per-species/per-35-day-window counts are a
 * trivial fraction of this (dozens, not thousands — verified live during
 * R3), but without a hard ceiling, a live-growing result set or a
 * malformed/inconsistent response could make the "full page, so keep
 * going" continuation condition never naturally terminate.
 */
const MAX_PAGES = 50;

/** Same house convention as `sources/gbif.ts`'s `GbifPageSchema` — validate the envelope, not every field of every record (the normalizer already safely drops a malformed individual record). */
const INaturalistPageSchema = z.object({
  total_results: z.number(),
  results: z.array(z.unknown()),
});

function buildPageUrl({
  scientificName,
  sinceDate,
  page,
}: {
  scientificName: string;
  sinceDate: string;
  page: number;
}): string {
  const params = new URLSearchParams({
    taxon_name: scientificName,
    nelat: String(maxLat),
    nelng: String(maxLon),
    swlat: String(minLat),
    swlng: String(minLon),
    d1: sinceDate,
    per_page: String(PAGE_LIMIT),
    page: String(page),
    order_by: "observed_on",
  });
  return `${INATURALIST_SEARCH_URL}?${params.toString()}`;
}

async function fetchSpeciesSightings(
  scientificName: string,
  sinceDate: string,
  fetchImpl: typeof fetch,
  backoffOptions: Omit<FetchWithBackoffOptions, "fetchImpl">,
): Promise<Sighting[]> {
  const sightings: Sighting[] = [];
  let page = 1;

  for (;;) {
    if (page > MAX_PAGES) {
      throw new Error(
        `iNaturalist pagination for "${scientificName}" exceeded the safety page limit (${MAX_PAGES}) — the date range or result set is probably wrong`,
      );
    }

    const url = buildPageUrl({ scientificName, sinceDate, page });
    const response = await fetchWithBackoff(url, { fetchImpl, ...backoffOptions });
    if (!response.ok) {
      throw new Error(`iNaturalist fetch failed (${response.status}) for "${scientificName}" at page ${page}`);
    }

    const data = INaturalistPageSchema.parse(await response.json());
    for (const record of data.results) {
      const sighting = normalizeINaturalistObservation(record as INaturalistObservation);
      if (sighting) sightings.push(sighting);
    }

    const fetchedSoFar = page * PAGE_LIMIT;
    if (data.results.length < PAGE_LIMIT || fetchedSoFar >= data.total_results) break;
    page += 1;
  }

  return sightings;
}

export interface FetchINaturalistSightingsOptions {
  /** YYYY-MM-DD — the start of the fetch window. */
  sinceDate: string;
  fetchImpl?: typeof fetch;
  /** Overridable for tests, so retry backoff doesn't actually wait — see `fetchWithBackoff`. */
  backoffDelayMs?: FetchWithBackoffOptions["delayMs"];
}

/**
 * Fetches, paginates, and normalizes iNaturalist observations for all
 * four tracked species since `sinceDate`, across the California coast
 * bbox — the freshness source GBIF can't be (GBIF's own aggregation of
 * the same platform's data lags weeks; this hits iNaturalist directly).
 *
 * Same `Promise.allSettled` shape as `sources/gbif.ts` and for the same
 * reason: one species failing must not discard the other three's
 * already-fetched results.
 */
export async function fetchINaturalistSightings({
  sinceDate,
  fetchImpl = fetch,
  backoffDelayMs,
}: FetchINaturalistSightingsOptions): Promise<Sighting[]> {
  const settled = await Promise.allSettled(
    SPECIES.map((species) =>
      fetchSpeciesSightings(
        SPECIES_SCIENTIFIC_NAMES[species],
        sinceDate,
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
      console.error(
        `fetchINaturalistSightings: "${SPECIES[index]}" failed this refresh cycle:`,
        result.reason,
      );
    }
  }
  return sightings;
}
