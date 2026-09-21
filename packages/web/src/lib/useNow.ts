import { useEffect, useState } from "react";

/**
 * Age-derived display (RecencyStamp's "N days ago", SightingsLayer's
 * per-pin age fade) only ever changes on a day boundary — 5 minutes is
 * just frequent enough that a long-lived open tab notices a crossing
 * within a reasonable margin, not a claim of live precision.
 */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * A `Date` that ticks on an interval, so a component reading "now" isn't
 * frozen at whatever moment it first mounted. Without this, both
 * `RecencyStamp`'s "N days ago" text and `SightingsLayer`'s per-pin
 * age-based opacity only ever recomputed on a refetch (a filter change or
 * remount) — a tab left open across a day boundary would keep showing an
 * increasingly stale age indefinitely. A previously-accepted, documented
 * trade-off (see RecencyStamp's own doc comment) now closed.
 */
export function useNow(intervalMs: number = DEFAULT_INTERVAL_MS): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
