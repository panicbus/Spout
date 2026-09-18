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
