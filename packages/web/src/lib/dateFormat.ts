/**
 * Formats a bare `YYYY-MM-DD` date (no time, no timezone — e.g. a
 * model's `modelDate`, or a sighting's `observedAt` date portion) as a
 * short, readable stamp. Forces `timeZone: "UTC"` deliberately: a bare
 * date string parses as UTC midnight, and formatting that in a viewer's
 * local timezone west of UTC (US Pacific, for one) would silently print
 * the day before — e.g. "2026-09-15" reading as "Sep 14, 2026" for a
 * Pacific-time viewer. That's exactly the kind of subtle wrongness this
 * product exists to avoid (see the spec's core promise: pin freshness
 * must never mislead).
 */
export function formatDateStamp(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

const BARE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats a `Sighting.observedAt` value, which — unlike `modelDate` — is
 * NOT always a bare `YYYY-MM-DD`: GBIF's `eventDate` can be one, but
 * iNaturalist and some GBIF records carry a full ISO datetime, sometimes
 * with an explicit `Z`/offset and sometimes without (see
 * `sightingsDb.ts`'s comment on GBIF's timezone-naive `eventDate`).
 * `formatDateStamp` assumes a bare date and appends its own `T00:00:00Z`
 * suffix — calling it directly on a value that already has a time
 * component would produce a doubled, unparseable string (`"...T13:21T00:
 * 00:00Z"`). This checks the shape first and only reuses
 * `formatDateStamp`'s UTC-forcing behavior for the bare-date case, where
 * the exact same negative-UTC-offset bug it exists to avoid applies
 * equally; a datetime value is formatted directly (accepting the same
 * timezone-naive imprecision already documented and accepted elsewhere
 * in this project for GBIF's offset-less timestamps — not solvable here
 * without knowing the true source timezone).
 */
export function formatObservedAt(observedAt: string): string {
  if (BARE_DATE_PATTERN.test(observedAt)) return formatDateStamp(observedAt);

  const date = new Date(observedAt);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
