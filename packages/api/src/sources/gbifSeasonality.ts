import { SPECIES, SPECIES_SCIENTIFIC_NAMES, type Species } from "@spout/contracts";
import { z } from "zod";
import { fetchWithBackoff } from "./http.js";

const GBIF_SEARCH_URL = "https://api.gbif.org/v1/occurrence/search";
/** GBIF's own taxon key for the whole order Cetacea — the effort-normalization denominator (see ADR 0006): "of all cetacean reports here in this window, what share were this species." */
const CETACEA_TAXON_KEY = 733;
/** How many years of history to pool — wide enough for a stable seasonal signal at a real tap location without diluting it across a changing baseline (species range shifts, reporting-effort growth) over too many decades. */
const YEARS_OF_HISTORY = 11;
/**
 * Below this many all-cetacean reports in the target window, a
 * species' share is withheld rather than computed — verified live: a
 * real 1-degree cell of open mid-Pacific ocean returns zero cetacean
 * reports at all, and a handful of reports either way would make an
 * unstably huge swing in a reported percentage. This is deliberately a
 * judgment call, not a statistically derived threshold; revisit if real
 * usage shows it's set wrong in either direction.
 */
const MIN_SAMPLE_SIZE = 20;

/**
 * A flat-earth approximation (111km/degree latitude, narrowing by
 * cos(latitude) for longitude) — fine at the radius scale this queries
 * (tens of km), not meant for anything precision-sensitive.
 */
function bboxAroundPoint(lat: number, lon: number, radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

const MonthFacetPageSchema = z.object({
  count: z.number(),
  facets: z.array(
    z.object({
      field: z.string(),
      counts: z.array(z.object({ name: z.string(), count: z.number() })),
    }),
  ),
});

/**
 * `limit=0` — this only ever reads the facet summary, never actual
 * occurrence records, matching what was verified live during research:
 * a month-faceted query over a real bbox answers in well under a
 * second, which is what makes computing this on demand (no bulk
 * ingestion) viable at all.
 */
async function monthCounts(
  params: URLSearchParams,
  fetchImpl: typeof fetch,
): Promise<Record<number, number>> {
  const url = `${GBIF_SEARCH_URL}?${params.toString()}`;
  const response = await fetchWithBackoff(url, { fetchImpl });
  if (!response.ok) {
    throw new Error(`GBIF seasonality facet fetch failed (${response.status}): ${url}`);
  }

  const page = MonthFacetPageSchema.parse(await response.json());
  const monthFacet = page.facets.find((f) => f.field === "MONTH");
  const byMonth: Record<number, number> = {};
  for (const { name, count } of monthFacet?.counts ?? []) byMonth[Number(name)] = count;
  return byMonth;
}

export interface SpeciesSeasonalityResult {
  species: Species;
  share: number | undefined;
  sampleSize: number;
  /** Duke/NOAA ECMM habitat-model density (Phase 4, see ecmmDensity.ts) — `fetchSeasonality` itself never sets this; only the composed `fetchSeasonalityWithDensity` does. */
  estimatedDensity?: number;
}

export interface SeasonalityResult {
  month: number;
  species: SpeciesSeasonalityResult[];
}

export interface FetchSeasonalityOptions {
  radiusKm?: number;
  fetchImpl?: typeof fetch;
}

/** Shared by `fetchSeasonality` and the ECMM-enriched `fetchSeasonalityWithDensity` so `SeasonalityCache` can be handed either one. */
export type SeasonalityFetcher = (
  lat: number,
  lon: number,
  month: number,
  options?: FetchSeasonalityOptions,
) => Promise<SeasonalityResult>;

/**
 * Computes, per tracked species, the effort-normalized share of
 * all-cetacean reports near `(lat, lon)` that were that species, for the
 * given calendar `month` — the "of everyone who reported a whale here in
 * this window, what fraction reported this species" figure ADR 0006
 * settled on, deliberately not an absolute sighting probability.
 *
 * Two GBIF facet queries per species pair (this species + the Cetacea
 * denominator) run in parallel, all sharing the same bbox/date-range
 * base params so numerator and denominator are always drawn from
 * exactly the same effort pool.
 */
export async function fetchSeasonality(
  lat: number,
  lon: number,
  month: number,
  { radiusKm = 50, fetchImpl = fetch }: FetchSeasonalityOptions = {},
): Promise<SeasonalityResult> {
  const bbox = bboxAroundPoint(lat, lon, radiusKm);
  const untilYear = new Date().getFullYear();
  const sinceYear = untilYear - YEARS_OF_HISTORY;

  function baseParams(): URLSearchParams {
    return new URLSearchParams({
      decimalLatitude: `${bbox.minLat.toFixed(4)},${bbox.maxLat.toFixed(4)}`,
      decimalLongitude: `${bbox.minLon.toFixed(4)},${bbox.maxLon.toFixed(4)}`,
      hasCoordinate: "true",
      year: `${sinceYear},${untilYear}`,
      facet: "month",
      facetLimit: "12",
      limit: "0",
    });
  }

  const cetaceaParams = baseParams();
  cetaceaParams.set("taxonKey", String(CETACEA_TAXON_KEY));
  const allCetaceaByMonth = await monthCounts(cetaceaParams, fetchImpl);
  const sampleSize = allCetaceaByMonth[month] ?? 0;

  const species = await Promise.all(
    SPECIES.map(async (sp): Promise<SpeciesSeasonalityResult> => {
      const params = baseParams();
      params.set("scientificName", SPECIES_SCIENTIFIC_NAMES[sp]);
      const byMonth = await monthCounts(params, fetchImpl);
      const numerator = byMonth[month] ?? 0;
      const share = sampleSize >= MIN_SAMPLE_SIZE ? numerator / sampleSize : undefined;
      return { species: sp, share, sampleSize };
    }),
  );

  return { month, species };
}
