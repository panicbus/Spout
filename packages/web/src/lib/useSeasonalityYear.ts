import type { SeasonalityYearResponse } from "@spout/contracts";
import { useEffect, useState } from "react";
import { fetchSeasonalityYear } from "./apiClient.js";

export type SeasonalityYearState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; data: SeasonalityYearResponse }
  | { state: "error"; error: unknown };

export interface SeasonalityYearTap {
  lat: number;
  lon: number;
}

function tapKey(tap: SeasonalityYearTap): string {
  return `${tap.lat},${tap.lon}`;
}

/**
 * Mirrors `useSeasonality`'s exact idle/loading/ok/error shape (see its
 * own doc comment for why "idle" is distinct from "loading", and why
 * settled state — not "idle"/"loading" — is what's actually stored).
 * Gated on `tap` being non-null so the extra GBIF round-trip only
 * happens once a user actually asks to see the full year (`SeasonalityCard`'s
 * "Show full year" toggle), not on every tap.
 */
export function useSeasonalityYear(tap: SeasonalityYearTap | null): SeasonalityYearState {
  const [settled, setSettled] = useState<{ key: string; state: SeasonalityYearState } | null>(null);

  useEffect(() => {
    if (!tap) return;

    let cancelled = false;
    const key = tapKey(tap);

    fetchSeasonalityYear(tap.lat, tap.lon)
      .then((data) => {
        if (!cancelled) setSettled({ key, state: { state: "ok", data } });
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ key, state: { state: "error", error } });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tap's lat/lon are the intentional, exhaustive dependencies; depending on `tap` itself would refire on every render since callers construct a new object each time
  }, [tap?.lat, tap?.lon]);

  if (!tap) return { state: "idle" };
  if (settled?.key === tapKey(tap)) return settled.state;
  return { state: "loading" };
}
