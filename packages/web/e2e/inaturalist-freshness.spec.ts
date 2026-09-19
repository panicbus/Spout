import { expect, test } from "@playwright/test";

const GBIF_INATURALIST_DATASET_ID = "50c9509d-22c7-4a22-a47d-8c48425ef4a7";

/**
 * Real iNaturalist direct fetch, real backend, real browser. Verifies
 * that `/api/sightings` carries data from BOTH ingestion paths added in
 * R2 (GBIF, including GBIF's own iNaturalist dataset) and R3
 * (iNaturalist direct) — and, more importantly, that the same
 * real-world observation reached through both paths converges onto one
 * row instead of appearing twice (`normalizeGbifRecord`'s
 * dataset-key-and-occurrenceID remapping onto `inaturalist:{id}`,
 * de-duped by the store's upsert-by-id).
 *
 * Tagged `@network` — see `probability-layer.spec.ts`'s doc comment for
 * why (excluded from the default CI job, run nightly instead).
 */
test("@network fetches real iNaturalist-direct sightings and converges them with GBIF's iNaturalist dataset", async ({
  page,
}) => {
  test.setTimeout(60_000); // cold-start backfill is the slowest real path in this app

  const sightingsResponse = page.waitForResponse(
    (res) => res.url().includes("/api/sightings") && res.status() === 200,
    { timeout: 45_000 },
  );

  await page.goto("/");

  const response = await sightingsResponse;
  const sightings: Array<{ id: string; attribution: { datasetId: string } }> = await response.json();

  expect(Array.isArray(sightings)).toBe(true);

  const direct = sightings.filter((s) => s.attribution.datasetId === "inaturalist-api-direct");
  // Not asserting exact counts (the corpus changes daily) — just that
  // real data came back from the iNaturalist-direct path specifically.
  expect(direct.length).toBeGreaterThan(0);
  expect(direct.every((s) => s.id.startsWith("inaturalist:"))).toBe(true);

  // Convergence: every id is unique across the whole (default, 30-day
  // window) response, even though the same observation can legitimately
  // be fetched by both paths (GBIF's iNat dataset and iNaturalist direct
  // overlap in their recent-history windows).
  const ids = sightings.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);

  // NOT asserting any row in THIS (default, 30-day-windowed) response
  // still carries GBIF's dataset id — verified live (R3) that within the
  // 30-day default window, every GBIF-iNaturalist-dataset record today
  // happens to also fall inside iNaturalist-direct's own 35-day fetch
  // window, so `routes/sightings.ts`'s deliberate write ordering (GBIF
  // first, iNaturalist-direct second — see its doc comment) means
  // iNaturalist-direct's more-authoritative copy wins every one of those
  // ids and its attribution is what survives here. That's the fix
  // working as intended, not a gap — proven separately below by querying
  // a window wide enough to reach GBIF-only rows iNaturalist-direct's
  // narrower window never touches, so never gets overwritten.
  const wideWindowResponse = await page.request.get("http://localhost:8787/api/sightings?window=90d");
  expect(wideWindowResponse.ok()).toBe(true);
  const wideWindowSightings: Array<{ id: string; attribution: { datasetId: string } }> =
    await wideWindowResponse.json();
  const viaGbif = wideWindowSightings.filter((s) => s.attribution.datasetId === GBIF_INATURALIST_DATASET_ID);
  expect(viaGbif.length).toBeGreaterThan(0);
  expect(viaGbif.every((s) => s.id.startsWith("inaturalist:"))).toBe(true);

  const canvas = page.getByTestId("map-canvas").locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();
});
