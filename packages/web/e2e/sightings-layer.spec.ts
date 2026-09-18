import { expect, test } from "@playwright/test";

/**
 * Real GBIF, real backend backfill (up to ~400 days across 4 species,
 * ~25s on a cold SQLite store — measured live during R2), real browser
 * fetch, real MapLibre clustered layer. `SightingsLayer` renders no
 * visible DOM of its own (unlike `ProbabilityLayer`'s stamp), so this
 * verifies via the real network response rather than visible text.
 *
 * Tagged `@network` — see `probability-layer.spec.ts`'s doc comment for
 * why (excluded from the default CI job, run nightly instead).
 */
test("@network fetches real GBIF-sourced sightings from the real API and renders them", async ({
  page,
}) => {
  test.setTimeout(60_000); // cold-start backfill is the slowest real path in this app

  const sightingsResponse = page.waitForResponse(
    (res) => res.url().includes("/api/sightings") && res.status() === 200,
    { timeout: 45_000 },
  );

  await page.goto("/");

  const response = await sightingsResponse;
  const sightings = await response.json();

  expect(Array.isArray(sightings)).toBe(true);
  // Not asserting an exact count (GBIF's corpus grows over time) — just
  // that real, schema-shaped, non-excluded data came back.
  expect(sightings.length).toBeGreaterThan(0);
  expect(sightings.every((s: { attribution: { datasetId: string } }) => s.attribution.datasetId !== "b3fc1d76-a50d-4a57-a2f3-425adfc59f9f")).toBe(true);

  const canvas = page.getByTestId("map-canvas").locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();
});
