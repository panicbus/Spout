import { afterEach, beforeEach, vi } from "vitest";

/**
 * Stubs `global.fetch` so a test can never reach the real network — every
 * source module (`sources/gbif.ts`, `sources/inaturalist.ts`,
 * `sources/whalewatch.ts`) takes an injectable `fetchImpl`, defaulting to
 * the real `fetch` only in production; a test that forgets to pass one
 * should reliably fail, not silently make a real live call.
 *
 * This exists because that exact mistake shipped once already: several
 * `routes/sightings.test.ts` tests only mocked `sightingsFetcher` and
 * left `inaturalistFetcher` unmocked after R3 added it, so `createApp`
 * fell through to the real iNaturalist API on every test run — caught
 * only by a slow/flaky suite, not by anything failing loudly.
 *
 * One honest caveat: a leak here does NOT surface as this function's own
 * thrown error message. `fetchWithBackoff` (`sources/http.ts`) — by
 * design, correctly — treats any rejected `fetchImpl` call as a
 * transient network error and retries it with real exponential backoff
 * before giving up, so a leaked call actually surfaces as vitest's own
 * "Test timed out" failure once retries exhaust, not as a fast, clearly-
 * worded error. That's still a hard, reliable test failure (the actual
 * goal), just not an instant one — deliberately not "fixed" by weakening
 * `fetchWithBackoff`'s real retry behavior to accommodate a test-only
 * guard.
 */
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error(
        "A test attempted a real fetch() call. Pass an explicit fetchImpl/fetcher mock instead of relying on the default.",
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});
