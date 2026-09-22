import { describe, expect, it, vi } from "vitest";
import { fetchSeasonalityWithDensity } from "../../src/sources/seasonalityWithDensity.js";

function facetResponse(total: number, byMonth: Record<number, number>) {
  return new Response(
    JSON.stringify({
      count: total,
      facets: [{ field: "MONTH", counts: Object.entries(byMonth).map(([name, count]) => ({ name, count })) }],
    }),
  );
}

function densityResponse(lat: number, lon: number, density: number | null) {
  return new Response(JSON.stringify({ table: { rows: [["2014-05-16T00:00:00Z", lat, lon, density]] } }));
}

const ATLANTIC_LAT = 42.35;
const ATLANTIC_LON = -70.2;

/**
 * One `fetchImpl`, branching on which upstream a given URL actually
 * targets — matching this project's DI convention (a single injected
 * `fetch`, not per-source mocking) rather than mocking either source
 * module directly.
 */
function combinedFetchImpl() {
  return vi.fn(async (url: string | URL) => {
    const str = String(url);
    if (str.includes("api.gbif.org")) {
      const params = new URL(str).searchParams;
      if (params.get("taxonKey") === "733") return facetResponse(1000, { 5: 50 });
      if (params.get("scientificName")?.includes("novaeangliae")) return facetResponse(300, { 5: 40 });
      return facetResponse(0, {});
    }
    if (str.includes("ECMM_Humpback_whale")) return densityResponse(ATLANTIC_LAT, ATLANTIC_LON, 2.5);
    return densityResponse(ATLANTIC_LAT, ATLANTIC_LON, null);
  });
}

describe("fetchSeasonalityWithDensity", () => {
  it("enriches each species with its ECMM density, without disturbing the GBIF-based share/sampleSize", async () => {
    const fetchImpl = combinedFetchImpl();

    const result = await fetchSeasonalityWithDensity(ATLANTIC_LAT, ATLANTIC_LON, 5, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const humpback = result.species.find((s) => s.species === "humpback-whale");
    const gray = result.species.find((s) => s.species === "gray-whale");
    expect(humpback).toMatchObject({ share: 40 / 50, sampleSize: 50, estimatedDensity: 2.5 });
    // gray-whale has no ECMM model at all — real coverage gap, not a fetch failure.
    expect(gray).toMatchObject({ sampleSize: 50, estimatedDensity: undefined });
  });

  it("still returns the GBIF-based result even when every species falls outside ECMM's coverage", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const str = String(url);
      if (str.includes("api.gbif.org")) return facetResponse(0, {});
      throw new Error("should never query ECMM outside its bbox");
    });

    // Monterey Bay, CA — nowhere near ECMM's Atlantic/Gulf coverage.
    const result = await fetchSeasonalityWithDensity(36.6, -121.9, 5, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.month).toBe(5);
    expect(result.species.every((s) => s.estimatedDensity === undefined)).toBe(true);
  });
});
