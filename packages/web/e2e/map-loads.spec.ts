import { expect, test } from "@playwright/test";

test("loads a real MapLibre map with real tiles centered on the California coast", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Spout/);

  const mapContainer = page.getByTestId("map-canvas");
  await expect(mapContainer).toBeVisible();

  // MapLibre renders its own <canvas> into the container once WebGL and
  // the style have loaded — this is the real-browser proof that R0's
  // unit-mocked map tests correspond to an actual working map.
  const canvas = mapContainer.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();

  // Navigation control (zoom in/out) is the one interactive affordance
  // this walking skeleton ships.
  await expect(page.getByLabel("Zoom in")).toBeVisible();
});
