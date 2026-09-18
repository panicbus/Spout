import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser layer per ADR/testing strategy: MapLibre cannot render in
 * jsdom (no WebGL context), so unit tests exercise pure logic against a
 * mocked `maplibre-gl` (see `src/test/maplibre-mock.ts`) and Playwright
 * exercises the actual map, actual tiles, actual WebGL, here.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      // Starts the real API too (not mocked) — probability-layer.spec.ts
      // exercises the full NOAA-to-browser pipeline for real, which is
      // the point of the e2e layer existing at all (unit tests already
      // cover the mocked/fixture path).
      command: "npm run dev",
      cwd: "../api",
      url: "http://localhost:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
