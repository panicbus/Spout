import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "../../src/store/ttlCache.js";

describe("TtlCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls the fetcher on the first get() and returns its result", async () => {
    const fetcher = vi.fn().mockResolvedValue("value-1");
    const cache = new TtlCache({ ttlMs: 1000, fetcher });

    expect(await cache.get()).toBe("value-1");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not call the fetcher again within the TTL window", async () => {
    const fetcher = vi.fn().mockResolvedValue("value-1");
    const cache = new TtlCache({ ttlMs: 1000, fetcher });

    await cache.get();
    await cache.get();
    await cache.get();

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("re-fetches once the TTL has elapsed", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("value-1").mockResolvedValueOnce("value-2");
    const cache = new TtlCache({ ttlMs: 1000, fetcher });

    await cache.get();
    vi.advanceTimersByTime(1001);

    expect(await cache.get()).toBe("value-2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("serves the stale cached value instead of throwing when a refresh fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("value-1")
      .mockRejectedValueOnce(new Error("upstream is down"));
    const cache = new TtlCache({ ttlMs: 1000, fetcher });

    await cache.get();
    vi.advanceTimersByTime(1001);

    expect(await cache.get()).toBe("value-1");
  });

  it("throws when the very first fetch fails — there is no stale value to fall back to yet", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("upstream is down"));
    const cache = new TtlCache({ ttlMs: 1000, fetcher });

    await expect(cache.get()).rejects.toThrow("upstream is down");
  });

  it("shares a single in-flight fetch across concurrent callers instead of triggering duplicate fetches", async () => {
    vi.useRealTimers(); // real microtask ordering is simpler to reason about here than fake timers
    let resolveFetch!: (value: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((resolve) => (resolveFetch = resolve)));
    const cache = new TtlCache({ ttlMs: 1000, fetcher });

    const [a, b, c] = [cache.get(), cache.get(), cache.get()];
    expect(fetcher).toHaveBeenCalledOnce();

    resolveFetch("value-1");
    expect(await Promise.all([a, b, c])).toEqual(["value-1", "value-1", "value-1"]);
  });

  it("stops serving a stale value past maxStaleMs and throws instead — unbounded staleness must not look like success forever", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("value-1")
      .mockRejectedValue(new Error("upstream is down"));
    const cache = new TtlCache({ ttlMs: 1000, maxStaleMs: 5000, fetcher });

    await cache.get(); // fetchedAt = t0
    vi.advanceTimersByTime(1001);
    expect(await cache.get()).toBe("value-1"); // still within maxStaleMs of t0

    vi.advanceTimersByTime(5000); // now well past maxStaleMs of the t0 fetch
    await expect(cache.get()).rejects.toThrow("upstream is down");
  });

  it("without maxStaleMs set, serves stale data indefinitely (the pre-existing, still-supported default)", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("value-1")
      .mockRejectedValue(new Error("upstream is down"));
    const cache = new TtlCache({ ttlMs: 1000, fetcher });

    await cache.get();
    vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 30); // 30 days

    expect(await cache.get()).toBe("value-1");
  });

  it("a successful refresh resets the staleness clock, so maxStaleMs is measured from the last real fetch, not the first", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("value-1")
      .mockResolvedValueOnce("value-2")
      .mockRejectedValue(new Error("upstream is down"));
    const cache = new TtlCache({ ttlMs: 1000, maxStaleMs: 5000, fetcher });

    await cache.get(); // t0
    vi.advanceTimersByTime(1001);
    await cache.get(); // successful refresh at t0+1001 -> "value-2"

    vi.advanceTimersByTime(5000); // 5000ms past the SECOND fetch, not the first
    expect(await cache.get()).toBe("value-2");
  });
});
