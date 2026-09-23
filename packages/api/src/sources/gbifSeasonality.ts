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

/** One species' full 12-month curve — `fetchSeasonalityYear`'s per-species result. Each month applies the same `MIN_SAMPLE_SIZE` honesty gate independently, exactly as `fetchSeasonality` does for its one requested month. */
export interface SpeciesSeasonalityYearResult {
  species: Species;
  months: { month: number; share: number | undefined; sampleSize: number }[];
}

export interface SeasonalityYearResult {
  species: SpeciesSeasonalityYearResult[];
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

/** `fetchSeasonalityYear`'s own shape, mirroring `SeasonalityFetcher` — `SeasonalityCache.getYear` and `app.ts`'s DI option are both typed against this rather than `typeof fetchSeasonalityYear` directly. */
export type SeasonalityYearFetcher = (
  lat: number,
  lon: number,
  options?: FetchSeasonalityOptions,
) => Promise<SeasonalityYearResult>;

function baseParams(bbox: ReturnType<typeof bboxAroundPoint>): URLSearchParams {
  const untilYear = new Date().getFullYear();
  const sinceYear = untilYear - YEARS_OF_HISTORY;
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

/**
 * The one shared GBIF round-trip both `fetchSeasonality` and
 * `fetchSeasonalityYear` build on: GBIF's own facet API already returns
 * a full 12-month breakdown per query (`monthCounts`, above) — this
 * fetches that once per species-plus-denominator (5 requests total,
 * never more, regardless of whether the caller wants one month or all
 * twelve) and hands back the raw counts. Extracting a single month
 * (`fetchSeasonality`) or every month (`fetchSeasonalityYear`) is pure
 * post-processing over the same data, not a second fetch.
 */
async function fetchAllMonthCounts(
  lat: number,
  lon: number,
  { radiusKm = 50, fetchImpl = fetch }: FetchSeasonalityOptions = {},
): Promise<{ allCetaceaByMonth: Record<number, number>; bySpecies: Record<Species, Record<number, number>> }> {
  const bbox = bboxAroundPoint(lat, lon, radiusKm);

  const cetaceaParams = baseParams(bbox);
  cetaceaParams.set("taxonKey", String(CETACEA_TAXON_KEY));
  const allCetaceaByMonth = await monthCounts(cetaceaParams, fetchImpl);

  const entries = await Promise.all(
    SPECIES.map(async (sp): Promise<[Species, Record<number, number>]> => {
      const params = baseParams(bbox);
      params.set("scientificName", SPECIES_SCIENTIFIC_NAMES[sp]);
      return [sp, await monthCounts(params, fetchImpl)];
    }),
  );

  return { allCetaceaByMonth, bySpecies: Object.fromEntries(entries) as Record<Species, Record<number, number>> };
}

/**
 * Computes, per tracked species, the effort-normalized share of
 * all-cetacean reports near `(lat, lon)` that were that species, for the
 * given calendar `month` — the "of everyone who reported a whale here in
 * this window, what fraction reported this species" figure ADR 0006
 * settled on, deliberately not an absolute sighting probability.
 */
export async function fetchSeasonality(
  lat: number,
  lon: number,
  month: number,
  options: FetchSeasonalityOptions = {},
): Promise<SeasonalityResult> {
  const { allCetaceaByMonth, bySpecies } = await fetchAllMonthCounts(lat, lon, options);
  const sampleSize = allCetaceaByMonth[month] ?? 0;

  const species = SPECIES.map((sp): SpeciesSeasonalityResult => {
    const numerator = bySpecies[sp][month] ?? 0;
    const share = sampleSize >= MIN_SAMPLE_SIZE ? numerator / sampleSize : undefined;
    return { species: sp, share, sampleSize };
  });

  return { month, species };
}

/**
 * The same effort-normalized share as `fetchSeasonality`, for all 12
 * months in one call — "what does this whole spot's calendar look
 * like," not just today. Costs the *same* 5 GBIF requests as a
 * single-month `fetchSeasonality` call (see `fetchAllMonthCounts`),
 * since GBIF's facet API already returns the full year per request;
 * this only differs in which months of that already-fetched data it
 * keeps. Each month applies `MIN_SAMPLE_SIZE` independently — a
 * well-sampled July next to an unsampled February is expected, not a
 * bug, at a seasonal location.
 */
export async function fetchSeasonalityYear(
  lat: number,
  lon: number,
  options: FetchSeasonalityOptions = {},
): Promise<SeasonalityYearResult> {
  const { allCetaceaByMonth, bySpecies } = await fetchAllMonthCounts(lat, lon, options);

  const species = SPECIES.map((sp): SpeciesSeasonalityYearResult => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const sampleSize = allCetaceaByMonth[month] ?? 0;
      const numerator = bySpecies[sp][month] ?? 0;
      const share = sampleSize >= MIN_SAMPLE_SIZE ? numerator / sampleSize : undefined;
      return { month, share, sampleSize };
    });
    return { species: sp, months };
  });

  return { species };
}
