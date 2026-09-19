import { buildSighting } from "@spout/contracts/fixtures.js";
import { describe, expect, it, vi } from "vitest";
import { openSightingsDb, querySightings } from "../../src/store/sightingsDb.js";
import { createINaturalistRefreshCache } from "../../src/store/inaturalistRefresh.js";

describe("createINaturalistRefreshCache", () => {
  it("fetches and upserts into the db on first get(), and reports how many landed", async () => {
    const db = openSightingsDb(":memory:");
    const fetcher = vi
      .fn()
      .mockResolvedValue([buildSighting({ id: "inaturalist:1" }), buildSighting({ id: "inaturalist:2" })]);
    const cache = createINaturalistRefreshCache(db, { ttlMs: 1000, fetcher });

    const result = await cache.get();

    expect(result.count).toBe(2);
    expect(querySightings(db, {})).toHaveLength(2);
  });

  it("always fetches a fixed, short recent window — no cold-start/incremental distinction, since iNaturalist direct only covers freshness, not historical depth (GBIF owns that)", async () => {
    const db = openSightingsDb(":memory:");
    const fetcher = vi.fn().mockResolvedValue([]);
    const cache = createINaturalistRefreshCache(db, { ttlMs: 1000, fetcher });

    await cache.get();

    const [{ sinceDate }] = fetcher.mock.calls[0] as [{ sinceDate: string }];
    const daysAgo = (Date.now() - new Date(sinceDate).getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeGreaterThan(6);
    expect(daysAgo).toBeLessThan(60);
  });

  it("does not refetch within the TTL window", async () => {
    const db = openSightingsDb(":memory:");
    const fetcher = vi.fn().mockResolvedValue([buildSighting({ id: "inaturalist:1" })]);
    const cache = createINaturalistRefreshCache(db, { ttlMs: 10_000, fetcher });

    await cache.get();
    await cache.get();

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("passes maxStaleMs through to the underlying TtlCache, so a persistent failure eventually throws instead of silently serving indefinitely stale data forever", async () => {
    // Mirrors the GBIF sibling test in sightingsRefresh.test.ts: a first
    // successful fetch, then a persistent failure past both ttlMs and
    // maxStaleMs. Without this — e.g. just rejecting on a cache with no
    // prior successful value — TtlCache.get() throws regardless of
    // whether maxStaleMs was even threaded through at all (a cold cache
    // with no cached value always throws on a failed fetch), so that
    // shape of test can't actually catch a regression that drops
    // maxStaleMs from createINaturalistRefreshCache.
    vi.useFakeTimers();
    const db = openSightingsDb(":memory:");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([buildSighting({ id: "inaturalist:1" })])
      .mockRejectedValue(new Error("iNaturalist is down"));
    const cache = createINaturalistRefreshCache(db, { ttlMs: 1000, maxStaleMs: 5000, fetcher });

    await cache.get();
    vi.advanceTimersByTime(6001); // past both ttlMs and maxStaleMs

    await expect(cache.get()).rejects.toThrow("iNaturalist is down");
    vi.useRealTimers();
  });
});
