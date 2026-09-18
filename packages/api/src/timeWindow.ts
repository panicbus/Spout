import type { TimeWindow } from "@spout/contracts";

/** Returns a YYYY-MM-DD date `days` before `now` — the one place this Date arithmetic lives (previously duplicated across this file, `sightingsRefresh.ts`, and `sources/gbif.ts`'s `untilDate` default). */
export function dateDaysAgo(days: number, now: Date = new Date()): string {
  const target = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

/**
 * `"latest"` maps to a short 7-day window because GBIF itself has no
 * data fresher than that most days (verified during initial data-source
 * validation — see ADR 0002/0003). This endpoint's `/api/sightings`
 * currently serves GBIF only (R2); once R3 adds iNaturalist's direct
 * API into the same store, `"latest"` starts returning real recent
 * records instead of usually-empty ones — the window itself doesn't
 * need to change, only what's been ingested into it.
 */
const WINDOW_DAYS: Record<TimeWindow, number> = {
  latest: 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

/** Returns a YYYY-MM-DD cutoff date for `window`, relative to `now`. */
export function sinceDateForWindow(window: TimeWindow, now: Date = new Date()): string {
  return dateDaysAgo(WINDOW_DAYS[window], now);
}
