import { describe, expect, it, vi } from "vitest";
import { fetchSeasonality, fetchSeasonalityYear } from "../../src/sources/gbifSeasonality.js";

function facetResponse(total: number, byMonth: Record<number, number>) {
  return {
    count: total,
    facets: [
      {
        field: "MONTH",
        counts: Object.entries(byMonth).map(([name, count]) => ({ name, count })),
      },
    ],
  };
}

describe("fetchSeasonality", () => {
  it("computes each species' effort-normalized share of all-cetacean reports in the target month", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const params = new URL(url.toString()).searchParams;
      if (params.get("taxonKey") === "733") {
        // all-cetacea denominator: 100 reports in September
        return new Response(JSON.stringify(facetResponse(1000, { 9: 100 })));
      }
      if (params.get("scientificName")?.includes("novaeangliae")) {
        // humpback: 86 of those 100 September reports
        return new Response(JSON.stringify(facetResponse(300, { 9: 86 })));
      }
      // every other species: none this month
      return new Response(JSON.stringify(facetResponse(0, {})));
    });

    const result = await fetchSeasonality(36.6, -121.9, 9, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.month).toBe(9);
    const humpback = result.species.find((s) => s.species === "humpback-whale");
    expect(humpback).toMatchObject({ share: 0.86, sampleSize: 100 });
  });

  it("omits share (never fabricating 0) when the all-cetacean sample size is below the honesty threshold — the mid-Pacific case, verified live: a real 1deg cell of open ocean returns zero cetacean reports", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(facetResponse(0, {}))));

    const result = await fetchSeasonality(25.5, -149.5, 6, { fetchImpl: fetchImpl as unknown as typeof fetch });

    for (const species of result.species) {
      expect(species.share).toBeUndefined();
      expect(species.sampleSize).toBe(0);
    }
  });

  it("reports 0 share (not undefined) for a species genuinely never seen in an otherwise well-sampled month, distinct from 'not enough data to say'", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const params = new URL(url.toString()).searchParams;
      if (params.get("taxonKey") === "733") {
        return new Response(JSON.stringify(facetResponse(1000, { 1: 500 }))); // well-sampled January
      }
      return new Response(JSON.stringify(facetResponse(0, {}))); // this species: never in January
    });

    const result = await fetchSeasonality(36.6, -121.9, 1, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.species.every((s) => s.share === 0)).toBe(true);
  });

  it("queries a bbox centered on the given point, sized by radiusKm", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL) => new Response(JSON.stringify(facetResponse(0, {}))));

    await fetchSeasonality(36.6, -121.9, 9, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      radiusKm: 111,
    });

    const [url] = fetchImpl.mock.calls[0]!;
    const params = new URL(url).searchParams;
    // 111km ~= 1 degree of latitude; longitude widens with cos(lat) but
    // stays close to 1 degree this near the equator-ish mid-latitudes.
    expect(params.get("decimalLatitude")).toBe("35.6000,37.6000");
    expect(params.get("decimalLongitude")).toMatch(/^-123\./);
  });
});

describe("fetchSeasonalityYear", () => {
  it("returns all 12 months per species from exactly 5 fetchImpl calls — the same GBIF facet requests fetchSeasonality makes for any single month, since the year is already fetched in full per request", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const params = new URL(url.toString()).searchParams;
      if (params.get("taxonKey") === "733") {
        // Well-sampled all year, humpback peaks Jul-Oct.
        return new Response(
          JSON.stringify(facetResponse(2000, { 1: 50, 2: 50, 3: 60, 4: 70, 5: 80, 6: 90, 7: 100, 8: 100, 9: 100, 10: 90, 11: 60, 12: 50 })),
        );
      }
      if (params.get("scientificName")?.includes("novaeangliae")) {
        return new Response(
          JSON.stringify(facetResponse(700, { 1: 2, 2: 2, 3: 5, 4: 10, 5: 20, 6: 40, 7: 80, 8: 85, 9: 80, 10: 60, 11: 10, 12: 2 })),
        );
      }
      return new Response(JSON.stringify(facetResponse(0, {})));
    });

    const result = await fetchSeasonalityYear(36.6, -121.9, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(5); // 1 Cetacea denominator + 4 species, never per-month
    const humpback = result.species.find((s) => s.species === "humpback-whale");
    expect(humpback?.months).toHaveLength(12);
    expect(humpback?.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // Real seasonal shape survives the year-wide extraction: low in
    // winter/spring, peaking Jul-Oct, matching Phase 1's already
    // live-verified humpback pattern.
    const julyShare = humpback?.months.find((m) => m.month === 7)?.share;
    const januaryShare = humpback?.months.find((m) => m.month === 1)?.share;
    expect(julyShare).toBeCloseTo(80 / 100, 5);
    expect(januaryShare).toBeCloseTo(2 / 50, 5);
  });

  it("applies the sample-size honesty threshold independently per month, not once for the whole year", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const params = new URL(url.toString()).searchParams;
      if (params.get("taxonKey") === "733") {
        // January is well-sampled; June has almost nothing reported.
        return new Response(JSON.stringify(facetResponse(500, { 1: 500, 6: 3 })));
      }
      return new Response(JSON.stringify(facetResponse(50, { 1: 50, 6: 1 })));
    });

    const result = await fetchSeasonalityYear(25.5, -149.5, { fetchImpl: fetchImpl as unknown as typeof fetch });

    for (const sp of result.species) {
      const january = sp.months.find((m) => m.month === 1)!;
      const june = sp.months.find((m) => m.month === 6)!;
      expect(january.share).toBeDefined();
      expect(june.share).toBeUndefined(); // sampleSize 3 < MIN_SAMPLE_SIZE
      expect(june.sampleSize).toBe(3); // still surfaced, never fabricated as 0
    }
  });
});
