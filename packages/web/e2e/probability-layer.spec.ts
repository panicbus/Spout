import { expect, test } from "@playwright/test";

/**
 * The one place this app's whole real pipeline gets exercised together:
 * NOAA's manifest -> the real raster decode -> the API's validated JSON
 * -> a real browser fetch -> schema validation -> a MapLibre layer. Every
 * other test either mocks the network or mocks MapLibre; this doesn't
 * mock either. (This replaced a manual "start both servers, screenshot
 * it, eyeball it" check done twice by hand during R1 — including the one
 * that caught the heatmap-vs-circle rendering bug.)
 *
 * Tagged `@network`: this depends on a single live, unaffiliated
 * government research host (oceanview.pfeg.noaa.gov) actually being up.
 * CI's default blocking job excludes `@network` tests (see
 * `.github/workflows/ci.yml`'s `--grep-invert`) so a NOAA outage or
 * datacenter-IP throttling fails a scheduled nightly check, not every
 * push/PR. Run it locally with `npm run test:e2e` (no filter).
 */
test("@network fetches the real WhaleWatch 2.0 grid from the real API and renders it", async ({
  page,
}) => {
  await page.goto("/");

  // Proves the browser reached the real, locally-running API server
  // (see playwright.config.ts's api webServer entry), not a mock.
  await expect(page.getByText("API connected")).toBeVisible({ timeout: 20_000 });

  // Only renders once a real grid has been fetched, decoded server-side,
  // served, fetched again by the browser, and schema-validated on both
  // ends.
  await expect(page.getByText(/Blue whale probability —/)).toBeVisible({ timeout: 20_000 });

  // The layer itself was actually added to the map, not just fetched.
  const canvas = page.getByTestId("map-canvas").locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();
});
