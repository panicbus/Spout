/**
 * The most recent `observedAt` in `sightings`, or `null` for an empty
 * list. Compares by actual parsed time (`Date`), not raw string order:
 * a plain lexicographic `>` looks safe at first (ISO strings sort
 * correctly when every value shares the same shape/offset), but GBIF's
 * real `eventDate` values are sometimes offset-less local-feeling
 * datetimes (`sightingsDb.ts`'s comment: e.g. `"2026-08-06T13:21"`, no
 * `Z`/offset), and the JS `Date` parser reads an offset-less datetime as
 * LOCAL time while a bare `YYYY-MM-DD` date reads as UTC midnight — two
 * strings that look purely lexicographic can represent instants in
 * different, inconsistent frames. Comparing parsed epoch milliseconds
 * sidesteps that entirely, at the cost of being a hair more expensive
 * than a raw string compare — irrelevant at this function's scale (a
 * handful of sightings in a 7-day window, not a hot loop).
 */
export function mostRecentObservedAt(sightings: { observedAt: string }[]): string | null {
  if (sightings.length === 0) return null;
  return sightings.reduce(
    (latest, sighting) => (new Date(sighting.observedAt).getTime() > new Date(latest).getTime() ? sighting.observedAt : latest),
    sightings[0]!.observedAt,
  );
}

/** Formats a day count as ADR 0003's "most recent report: N days ago" stamp expects. */
export function formatDaysAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
