import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { INATURALIST_SEARCH_URL, fetchINaturalistSightings } from "../../src/sources/inaturalist.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../../../../fixtures/inaturalist/sample-page.json", import.meta.url),
);
const realPage = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));

function emptyPage() {
  return { total_results: 0, page: 1, per_page: 200, results: [] };
}

describe("fetchINaturalistSightings", () => {
  it("parses a real recorded iNaturalist page into normalized Sightings", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.startsWith(INATURALIST_SEARCH_URL) && href.includes("Megaptera")) {
        return new Response(JSON.stringify(realPage));
      }
      return new Response(JSON.stringify(emptyPage()));
    });

    const sightings = await fetchINaturalistSightings({ sinceDate: "2026-09-11", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(sightings.length).toBeGreaterThan(0);
    expect(sightings.every((s) => s.species === "humpback-whale")).toBe(true);
    expect(sightings.every((s) => s.sourceApi === "inaturalist")).toBe(true);
  });

  it("paginates across multiple pages until results run out — a full page (matching PAGE_LIMIT) continues, a partial page stops", async () => {
    // PAGE_LIMIT is 200; a page with fewer results is the "last page"
    // signal, so page 1 here must be exactly 200 to force a page 2 fetch.
    const page1 = {
      total_results: 201,
      page: 1,
      per_page: 200,
      results: Array.from({ length: 200 }, (_, i) => recordFixture(i + 1)),
    };
    const page2 = { total_results: 201, page: 2, per_page: 200, results: [recordFixture(201)] };

    const fetchImpl = vi.fn(async (url: string | URL) => {
      const parsed = new URL(url.toString());
      if (!parsed.searchParams.get("taxon_name")?.includes("musculus")) {
        return new Response(JSON.stringify(emptyPage()));
      }
      // "per_page=200" contains the literal substring "page=2", so this
      // must read the actual `page` param, not do substring matching on
      // the raw URL.
      return new Response(JSON.stringify(parsed.searchParams.get("page") === "2" ? page2 : page1));
    });

    const sightings = await fetchINaturalistSightings({ sinceDate: "2026-09-01", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(sightings).toHaveLength(201);
    expect(sightings.at(-1)?.id).toBe("inaturalist:201");
  });

  it("stops past a safety page limit instead of looping forever, mirroring sources/gbif.ts's MAX_OFFSET guard for the same class of risk", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // Always a full page with a total_results the fetcher can never
    // actually reach — without a safety net, the "full page, so keep
    // going" continuation condition (results.length === PAGE_LIMIT) never
    // breaks on its own.
    const neverEndingPage = {
      total_results: Number.MAX_SAFE_INTEGER,
      page: 1,
      per_page: 200,
      results: Array.from({ length: 200 }, (_, i) => recordFixture(i + 1)),
    };
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (!href.includes("musculus")) return new Response(JSON.stringify(emptyPage()));
      return new Response(JSON.stringify(neverEndingPage));
    });

    const sightings = await fetchINaturalistSightings({
      sinceDate: "2026-09-01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffDelayMs: () => 0,
    });

    // The species hit the safety net and failed (Promise.allSettled
    // isolates it), so it contributes nothing — the point of this test is
    // that the fetch loop terminates at all, in bounded time.
    expect(sightings).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not let one species' hard failure erase the other three species' already-fetched sightings", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes("Orcinus")) return new Response("server error", { status: 500 });
      if (href.includes("Balaenoptera") || href.includes("musculus")) {
        return new Response(
          JSON.stringify({ total_results: 1, page: 1, per_page: 200, results: [recordFixture(1)] }),
        );
      }
      return new Response(JSON.stringify(emptyPage()));
    });

    const sightings = await fetchINaturalistSightings({
      sinceDate: "2026-09-01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffDelayMs: () => 0,
    });

    expect(sightings.map((s) => s.id)).toEqual(["inaturalist:1"]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rejects when the response envelope doesn't match the expected shape", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes("Balaenoptera") || href.includes("musculus")) {
        return new Response(JSON.stringify({ oops: true }));
      }
      return new Response(JSON.stringify(emptyPage()));
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const sightings = await fetchINaturalistSightings({ sinceDate: "2026-09-01", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(sightings).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

function recordFixture(id: number) {
  return {
    id,
    taxon: { name: "Balaenoptera musculus" },
    quality_grade: "research",
    observed_on: "2026-09-01",
    time_observed_at: "2026-09-01T10:00:00-07:00",
    license_code: "cc0",
    obscured: false,
    location: "36.5,-122.1",
    public_positional_accuracy: 10,
    uri: `https://www.inaturalist.org/observations/${id}`,
  };
}
