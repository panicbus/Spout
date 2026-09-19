import { TIME_WINDOW_DAYS, type TimeWindow } from "@spout/contracts";

/** Returns a YYYY-MM-DD date `days` before `now` — the one place this Date arithmetic lives (previously duplicated across this file, `sightingsRefresh.ts`, and `sources/gbif.ts`'s `untilDate` default). */
export function dateDaysAgo(days: number, now: Date = new Date()): string {
  const target = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

/** Returns a YYYY-MM-DD cutoff date for `window`, relative to `now`. See `TIME_WINDOW_DAYS` (`@spout/contracts`) for the day-count mapping — `"latest"`'s 7 days exists because GBIF itself has no data fresher than that most days (verified during initial data-source validation — see ADR 0002/0003); R3's iNaturalist-direct API is what actually populates it with real recent records. */
export function sinceDateForWindow(window: TimeWindow, now: Date = new Date()): string {
  return dateDaysAgo(TIME_WINDOW_DAYS[window], now);
}
