import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { GBIF_SEARCH_URL, fetchGbifSightings } from "../../src/sources/gbif.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../../../../fixtures/gbif/sample-page.json", import.meta.url),
);
const realPage = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));

function emptyPage() {
  return { offset: 0, limit: 300, endOfRecords: true, count: 0, results: [] };
}

describe("fetchGbifSightings", () => {
  it("parses a real recorded GBIF page into normalized Sightings, dropping nothing that shouldn't be dropped", async () => {
    // Only the humpback query returns real data; the other 3 species
    // return an empty page so this test isolates one species's fetch+
    // normalize path against a real, unmodified GBIF response.
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const parsed = new URL(url.toString());
      // The real fixture's own endOfRecords is false (it's page 1 of a
      // bigger real result set) — only serve it once, at offset=0, then
      // report the page as finished so this test isolates exactly what
      // fetching ONE real page and normalizing it produces. Reads the
      // actual `offset` param rather than substring-matching the URL —
      // "offset=0" would also false-match "offset=20"/"offset=200", etc.
      if (
        parsed.origin + parsed.pathname === GBIF_SEARCH_URL &&
        parsed.searchParams.get("scientificName")?.includes("Megaptera") &&
        parsed.searchParams.get("offset") === "0"
      ) {
        return new Response(JSON.stringify({ ...realPage, endOfRecords: true }));
      }
      return new Response(JSON.stringify(emptyPage()));
    });

    const sightings = await fetchGbifSightings({ sinceDate: "2026-08-01", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(sightings.length).toBeGreaterThan(0);
    expect(sightings.every((s) => s.species === "humpback-whale")).toBe(true);
    // Every record in this real fixture is genuinely from GBIF's
    // iNaturalist dataset (verified: each has a datasetKey of
    // 50c9509d-... and an occurrenceID like
    // https://www.inaturalist.org/observations/<id>) — so R3's de-dup
    // convergence (normalize/sighting.ts) correctly re-ids all of them
    // onto sourceApi "inaturalist", not "gbif". This is real data
    // proving that convergence actually fires, not a synthetic case.
    expect(sightings.every((s) => s.sourceApi === "inaturalist")).toBe(true);
    expect(sightings.every((s) => s.id.startsWith("inaturalist:"))).toBe(true);
  });

  it("paginates until endOfRecords is true, not just fetching the first page", async () => {
    const page1 = { offset: 0, limit: 2, endOfRecords: false, count: 3, results: [
      recordFixture(1), recordFixture(2),
    ] };
    const page2 = { offset: 2, limit: 2, endOfRecords: true, count: 3, results: [recordFixture(3)] };

    const fetchImpl = vi.fn(async (url: string | URL) => {
      const parsed = new URL(url.toString());
      if (!parsed.searchParams.get("scientificName")?.includes("musculus")) {
        return new Response(JSON.stringify(emptyPage()));
      }
      // Reads the actual `offset` param — "offset=2" would also
      // false-match "offset=20"/"offset=200" via naive substring checks.
      const isSecondPage = parsed.searchParams.get("offset") === "2";
      return new Response(JSON.stringify(isSecondPage ? page2 : page1));
    });

    const sightings = await fetchGbifSightings({ sinceDate: "2026-08-01", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(sightings.map((s) => s.id)).toEqual(["gbif:1", "gbif:2", "gbif:3"]);
  });

  it("silently omits records normalizeGbifRecord drops, rather than failing the whole fetch", async () => {
    const page = {
      offset: 0,
      limit: 300,
      endOfRecords: true,
      count: 2,
      results: [
        recordFixture(1),
        { ...recordFixture(2), publishingOrgKey: "00000000-0000-0000-0000-000000000000" }, // unknown publisher, dropped
      ],
    };
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes("Balaenoptera+musculus") || href.includes("Balaenoptera%20musculus")) {
        return new Response(JSON.stringify(page));
      }
      return new Response(JSON.stringify(emptyPage()));
    });

    const sightings = await fetchGbifSightings({ sinceDate: "2026-08-01", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(sightings.map((s) => s.id)).toEqual(["gbif:1"]);
  });

  it("does not let one species' hard failure erase the other three species' already-fetched sightings", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes("Orcinus")) {
        return new Response("server error", { status: 500 });
      }
      if (href.includes("Balaenoptera+musculus") || href.includes("Balaenoptera%20musculus")) {
        return new Response(
          JSON.stringify({ offset: 0, endOfRecords: true, results: [recordFixture(1)] }),
        );
      }
      return new Response(JSON.stringify(emptyPage()));
    });

    const sightings = await fetchGbifSightings({
      sinceDate: "2026-08-01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      // Skip the real retry delays — this test only cares about the
      // post-exhaustion behavior, not the backoff timing itself.
      backoffDelayMs: () => 0,
    });

    expect(sightings.map((s) => s.id)).toEqual(["gbif:1"]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("rejects when the GBIF response envelope doesn't match the expected shape, rather than a raw TypeError deep in pagination", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href.includes("Balaenoptera+musculus") || href.includes("Balaenoptera%20musculus")) {
        return new Response(JSON.stringify({ oops: "not shaped like a GBIF page" }));
      }
      return new Response(JSON.stringify(emptyPage()));
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const sightings = await fetchGbifSightings({
      sinceDate: "2026-08-01",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // Isolated per-species (see the Promise.allSettled test above) —
    // the malformed species is dropped and logged, the other three
    // (empty but well-formed) still resolve cleanly.
    expect(sightings).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

function recordFixture(key: number) {
  return {
    key,
    scientificName: "Balaenoptera musculus",
    decimalLatitude: 36.5,
    decimalLongitude: -122.1,
    eventDate: "2026-08-15",
    datasetKey: "some-dataset",
    datasetName: "Some Dataset",
    publishingOrgKey: "67b2263f-6990-4d9d-b32b-20aa72ef4fbc",
    license: "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
  };
}
