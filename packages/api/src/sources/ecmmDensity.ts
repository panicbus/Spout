import type { Species } from "@spout/contracts";
import { z } from "zod";
import { fetchWithBackoff, type FetchWithBackoffOptions } from "./http.js";

const ERDDAP_BASE = "https://coastwatch.pfeg.noaa.gov/erddap/griddap";

/**
 * Duke University Marine Geospatial Ecology Laboratory's "ECMM" habitat
 * density models (Roberts et al. 2016, updated 2022; CC-BY 4.0;
 * https://seamap.env.duke.edu/models/Duke/EC/) — verified live per
 * dataset. Only 3 of our 4 tracked species have a model at all
 * (gray-whale is a Pacific/Arctic migrant, genuinely absent from this
 * Atlantic-only project, not a gap in our lookup), and they're not all
 * the same temporal resolution: humpback ships a real 12-month
 * climatology, but blue whale and killer whale each publish only a
 * single year-round average (their `time` axis has exactly one value) —
 * confirmed by querying each dataset's `.das` metadata directly, not
 * assumed from the species list. `temporal` records which case applies
 * so `pointQueryUrl` below never sends a month constraint a dataset
 * doesn't actually have.
 */
const ECMM_DATASETS: Partial<Record<Species, { id: string; temporal: "monthly" | "annual" }>> = {
  "blue-whale": { id: "ECMM_Blue_whale", temporal: "annual" },
  "humpback-whale": { id: "ECMM_Humpback_whale", temporal: "monthly" },
  orca: { id: "ECMM_Killer_whale", temporal: "annual" },
};

/**
 * The shared grid bbox across all ECMM datasets (verified identical via
 * each dataset's `.das` `actual_range` for latitude/longitude) — U.S.
 * Atlantic coast and northern Gulf of Mexico. Checked before ever making
 * a network call: a tap in California or mid-Pacific has no chance of a
 * result, so there's no reason to round-trip to NOAA to find that out.
 */
const ECMM_BBOX = {
  minLat: 23.156215948215642,
  maxLat: 47.701744867003754,
  minLon: -82.34740343532766,
  maxLon: -56.23721928665664,
};

/** The humpback climatology's 12 monthly composites are all stored under this one representative year — only the month component of the constructed date is ever meaningful. */
const CLIMATOLOGY_YEAR = 2014;

function isWithinEcmmBbox(lat: number, lon: number): boolean {
  return lat >= ECMM_BBOX.minLat && lat <= ECMM_BBOX.maxLat && lon >= ECMM_BBOX.minLon && lon <= ECMM_BBOX.maxLon;
}

function pointQueryUrl(datasetId: string, temporal: "monthly" | "annual", month: number, lat: number, lon: number): string {
  const time =
    temporal === "monthly" ? `${CLIMATOLOGY_YEAR}-${String(month).padStart(2, "0")}-16T00:00:00Z` : "last";
  return `${ERDDAP_BASE}/${datasetId}.json?density%5B(${time})%5D%5B(${lat})%5D%5B(${lon})%5D`;
}

/** ERDDAP's griddap JSON table response for a single-point query: one row, columns [time, latitude, longitude, density]. `density` is `null` for a valid grid cell with no estimate (e.g. land), not just for a genuinely out-of-range point (that's a 404, handled separately). */
const ErddapPointResponseSchema = z.object({
  table: z.object({
    rows: z.array(z.tuple([z.string(), z.number(), z.number(), z.number().nullable()])),
  }),
});

export interface FetchEcmmDensityOptions {
  fetchImpl?: typeof fetch;
  /** Overridable for tests, so retry backoff doesn't actually wait — see `fetchWithBackoff`. */
  backoffDelayMs?: FetchWithBackoffOptions["delayMs"];
}

/**
 * Point-queries Duke/NOAA's ECMM habitat density model for `species` at
 * `(lat, lon)` for calendar `month`, in animals per 100 km² — an
 * independent, model-based corroboration of the GBIF-sighting-based
 * `share` figure `fetchSeasonality` computes, shown as a second line per
 * ADR 0006's follow-up (Phase 4), never blended into `share` itself.
 *
 * Returns `undefined` — never throws — whenever there's genuinely
 * nothing to show: no model exists for this species, the point falls
 * outside ECMM's Atlantic/Gulf coverage, or the upstream request itself
 * fails for any reason. This is explicitly an enrichment on top of the
 * core sighting-based answer, not a dependency of it — a Duke/NOAA
 * outage must never take down `/api/seasonality` itself.
 */
export async function fetchEcmmDensity(
  species: Species,
  lat: number,
  lon: number,
  month: number,
  { fetchImpl = fetch, backoffDelayMs }: FetchEcmmDensityOptions = {},
): Promise<number | undefined> {
  const dataset = ECMM_DATASETS[species];
  if (!dataset || !isWithinEcmmBbox(lat, lon)) return undefined;

  try {
    const url = pointQueryUrl(dataset.id, dataset.temporal, month, lat, lon);
    const response = await fetchWithBackoff(url, { fetchImpl, ...(backoffDelayMs ? { delayMs: backoffDelayMs } : {}) });
    // A 404 here is the expected shape of "this exact grid cell falls
    // just outside the dataset's coverage" (ERDDAP reports out-of-range
    // axis constraints as 404, verified live) — not an error worth
    // logging, just "no data."
    if (!response.ok) return undefined;

    const parsed = ErddapPointResponseSchema.parse(await response.json());
    return parsed.table.rows[0]?.[3] ?? undefined;
  } catch (error) {
    console.error(`ECMM density fetch failed for ${species} at (${lat}, ${lon}):`, error);
    return undefined;
  }
}
