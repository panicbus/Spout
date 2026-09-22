import type { SeasonalityResponse } from "@spout/contracts";
import { useEffect, useState } from "react";
import { fetchSeasonality } from "./apiClient.js";

export type SeasonalityState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; data: SeasonalityResponse }
  | { state: "error"; error: unknown };

export interface SeasonalityTap {
  lat: number;
  lon: number;
  date: string;
}

/**
 * Unlike `useFetch` (always runs on mount, keyed on a dependency array),
 * this is gated on `tap` being non-null — there's nothing to fetch until
 * a user actually taps the map, and no location/date until then either.
 * `"idle"` is a real, distinct state from `"loading"`: a closed
 * `SeasonalityCard` should render nothing, not a loading spinner for a
 * fetch that was never started.
 */
function tapKey(tap: SeasonalityTap): string {
  return `${tap.lat},${tap.lon},${tap.date}`;
}

export function useSeasonality(tap: SeasonalityTap | null): SeasonalityState {
  // Only ever holds a settled ("ok"/"error") result, tagged with the tap it
  // answers. "idle"/"loading" are derived at render time below rather than
  // stored, so a tap change is reflected immediately (no synchronous
  // setState-in-effect needed to flip into "loading").
  const [settled, setSettled] = useState<{ key: string; state: SeasonalityState } | null>(null);

  useEffect(() => {
    if (!tap) return;

    let cancelled = false;
    const key = tapKey(tap);

    fetchSeasonality(tap.lat, tap.lon, tap.date)
      .then((data) => {
        if (!cancelled) setSettled({ key, state: { state: "ok", data } });
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ key, state: { state: "error", error } });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tap's lat/lon/date are the intentional, exhaustive dependencies; depending on `tap` itself would refire on every render since callers construct a new object each time
  }, [tap?.lat, tap?.lon, tap?.date]);

  if (!tap) return { state: "idle" };
  if (settled?.key === tapKey(tap)) return settled.state;
  return { state: "loading" };
}
