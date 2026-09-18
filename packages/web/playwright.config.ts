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
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
