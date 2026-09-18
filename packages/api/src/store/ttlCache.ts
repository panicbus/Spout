export interface TtlCacheOptions<T> {
  /** How long a fetched value is served without re-fetching. */
  ttlMs: number;
  /**
   * How long a value may be served after a *failed* refresh before
   * `get()` throws instead of continuing to serve it. Unset means no
   * ceiling — stale data is served indefinitely on repeated failures,
   * which is the right default for a cache with no honesty requirement
   * but the wrong one for anything user-facing about freshness (see
   * `ProbabilityCache`, which does set this).
   */
  maxStaleMs?: number;
  fetcher: () => Promise<T>;
}

/**
 * A generic single-value cache-with-refresh, backing `ProbabilityCache`
 * today and the R2/R3 sightings/citizen sources next — written generic
 * from the start rather than copy-pasted per source, so a fix to its
 * behavior (like the in-flight de-dup below) lands once, not N times.
 *
 * Three things every consumer gets:
 * - **Stale-on-failure, bounded by `maxStaleMs`.** A refresh failure
 *   serves the last good value instead of throwing — an upstream being
 *   briefly down should degrade to "slightly older data," not a 503 for
 *   every visitor — but only up to `maxStaleMs` past the last successful
 *   fetch. Past that, a value old enough to no longer honestly resemble
 *   "current" throws instead of being served silently forever. Only the
 *   very first fetch (no stale value to fall back to at all) can throw
 *   before that ceiling is even reached.
 * - **In-flight de-duplication.** Concurrent callers hitting an expired
 *   or empty cache share one fetch instead of each starting their own —
 *   without this, N concurrent requests on a cold cache each trigger a
 *   full duplicate upstream fetch, and whichever happens to resolve last
 *   silently wins even if it started after a faster one already landed.
 *
 * Known limitation, accepted rather than silently absent: this cache is
 * in-memory only. A process restart during an upstream outage starts
 * with nothing cached, so the stale-on-failure protection above doesn't
 * cover that specific double-failure window. A persistent (disk/DB)
 * fallback would close it, at the cost of real complexity this project
 * doesn't otherwise need (see `ProbabilityCache`'s own comment on why it
 * isn't backed by SQLite) — revisit only if this actually bites in
 * practice.
 */
export class TtlCache<T> {
  private cached: T | null = null;
  private hasCached = false;
  private fetchedAt = 0;
  private inFlight: Promise<T> | null = null;

  constructor(private readonly options: TtlCacheOptions<T>) {}

  async get(): Promise<T> {
    const isFresh = this.hasCached && Date.now() - this.fetchedAt < this.options.ttlMs;
    if (isFresh) {
      return this.cached as T;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.options
      .fetcher()
      .then((value) => {
        this.cached = value;
        this.hasCached = true;
        this.fetchedAt = Date.now();
        return value;
      })
      .catch((error: unknown) => {
        const staleAgeMs = Date.now() - this.fetchedAt;
        const pastCeiling = this.options.maxStaleMs !== undefined && staleAgeMs > this.options.maxStaleMs;
        if (this.hasCached && !pastCeiling) return this.cached as T;
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}
