import { buildSighting } from "@spout/contracts/fixtures.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSightingsDb, querySightings } from "../../src/store/sightingsDb.js";
import { createSightingsRefreshCache } from "../../src/store/sightingsRefresh.js";

describe("createSightingsRefreshCache", () => {
  it("fetches and upserts into the db on first get(), and reports how many landed", async () => {
    const db = openSightingsDb(":memory:");
    const fetcher = vi
      .fn()
      .mockResolvedValue([buildSighting({ id: "a" }), buildSighting({ id: "b" })]);
    const cache = createSightingsRefreshCache(db, { ttlMs: 1000, fetcher });

    const result = await cache.get();

    expect(result.count).toBe(2);
    expect(querySightings(db, {})).toHaveLength(2);
  });

  it("passes a sinceDate to the fetcher covering more than a year, so the store can serve the widest supported window (12m)", async () => {
    const db = openSightingsDb(":memory:");
    const fetcher = vi.fn().mockResolvedValue([]);
    const cache = createSightingsRefreshCache(db, { ttlMs: 1000, fetcher });

    await cache.get();

    const [{ sinceDate }] = fetcher.mock.calls[0] as [{ sinceDate: string }];
    const daysAgo = (Date.now() - new Date(sinceDate).getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeGreaterThan(365);
  });

  it("does not refetch within the TTL window", async () => {
    const db = openSightingsDb(":memory:");
    const fetcher = vi.fn().mockResolvedValue([buildSighting({ id: "a" })]);
    const cache = createSightingsRefreshCache(db, { ttlMs: 10_000, fetcher });

    await cache.get();
    await cache.get();

    expect(fetcher).toHaveBeenCalledOnce();
  });

  describe("incremental refresh", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("uses a short recent window once the store already has data, instead of re-fetching the full backfill window every cycle — the steady-state cost must actually shrink, not stay equal to the cold-start cost forever", async () => {
      const db = openSightingsDb(":memory:");
      const fetcher = vi.fn().mockResolvedValue([buildSighting({ id: "a" })]);
      const cache = createSightingsRefreshCache(db, { ttlMs: 1000, fetcher });

      await cache.get(); // cold start: full backfill window, populates the store
      vi.advanceTimersByTime(1001);
      await cache.get(); // steady-state: store already has data

      const calls = fetcher.mock.calls as [{ sinceDate: string }][];
      const secondCallArgs = calls[1];
      if (!secondCallArgs) throw new Error("expected a second fetcher call");
      const daysAgo =
        (Date.now() - new Date(secondCallArgs[0].sinceDate).getTime()) / (24 * 60 * 60 * 1000);
      expect(daysAgo).toBeLessThan(30);
    });
  });

  it("passes maxStaleMs through to the underlying TtlCache, so a persistent failure eventually throws instead of silently hammering GBIF on every request forever", async () => {
    vi.useFakeTimers();
    const db = openSightingsDb(":memory:");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([buildSighting({ id: "a" })])
      .mockRejectedValue(new Error("GBIF is down"));
    const cache = createSightingsRefreshCache(db, { ttlMs: 1000, maxStaleMs: 5000, fetcher });

    await cache.get();
    vi.advanceTimersByTime(6001); // past both ttlMs and maxStaleMs

    await expect(cache.get()).rejects.toThrow("GBIF is down");
    vi.useRealTimers();
  });
});
