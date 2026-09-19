import { TIME_WINDOW_DAYS } from "@spout/contracts";

export type AgeBucket = "today" | "this-week" | "this-month" | "older";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days between `observedAt` and `now`, floored, never negative and
 * never `NaN`. `observedAt` can be a bare `YYYY-MM-DD` or a full ISO
 * datetime (both shapes appear in real `Sighting.observedAt` values —
 * see `sightingsDb.ts`'s comment on GBIF's timezone-naive `eventDate`);
 * `Date` parses either. Clamped at 0 rather than allowing a negative
 * value: a future `observedAt` (clock skew between this client and the
 * API, or the timezone-naive imprecision already accepted elsewhere in
 * this project) should read as "today," not as a confusing negative age.
 * An unparseable `observedAt` also reads as "today" (age 0) rather than
 * `NaN` — every real `Sighting` is schema-validated before it reaches
 * this function (`isoDateTimeString` in `@spout/contracts`'s
 * `sighting.ts` already rejects an unparseable value at the API
 * boundary), so this guard exists for this function's own general
 * contract, not a known-reachable production input; `Math.max(0, NaN)`
 * is `NaN`, not `0`, so the clamp above doesn't save this on its own.
 */
export function ageInDays(observedAt: string, now: Date = new Date()): number {
  const observed = new Date(observedAt);
  const diffDays = Math.floor((now.getTime() - observed.getTime()) / MS_PER_DAY);
  return Number.isNaN(diffDays) ? 0 : Math.max(0, diffDays);
}

/**
 * Buckets a sighting's age for visual treatment — `SightingsLayer` fades
 * older pins so the map itself communicates recency, not just a detail
 * card. Only "today" and "this-week" correspond to an actual filter
 * window a user can select (`TIME_WINDOW_DAYS.latest` is 7 days); "older"
 * is a catch-all for everything past 30 days and deliberately does not
 * distinguish `90d` from `12m` — a coarser visual treatment than the
 * filter set on purpose, not an oversight.
 */
export function ageBucket(observedAt: string, now: Date = new Date()): AgeBucket {
  const days = ageInDays(observedAt, now);
  if (days < 1) return "today";
  if (days < TIME_WINDOW_DAYS.latest) return "this-week";
  if (days < TIME_WINDOW_DAYS["30d"]) return "this-month";
  return "older";
}
