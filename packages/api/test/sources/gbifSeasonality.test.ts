import { describe, expect, it, vi } from "vitest";
import { fetchSeasonality } from "../../src/sources/gbifSeasonality.js";

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
