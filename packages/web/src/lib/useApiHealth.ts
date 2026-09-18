import type { HealthStatus } from "@spout/contracts";
import { useEffect, useState } from "react";
import { fetchHealth } from "./apiClient.js";

export type ApiHealthState =
  | { state: "checking" }
  | { state: "ok"; health: HealthStatus }
  | { state: "unreachable" };

/**
 * Fetches `/health` once on mount and exposes the result as three
 * explicit states rather than a bare loading boolean — "unreachable" is a
 * real, expected state here (a user opening this PWA with the API down
 * or offline shouldn't see a thrown error), not an edge case to ignore.
 */
export function useApiHealth(): ApiHealthState {
  const [state, setState] = useState<ApiHealthState>({ state: "checking" });

  useEffect(() => {
    let cancelled = false;

    fetchHealth()
      .then((health) => {
        if (!cancelled) setState({ state: "ok", health });
      })
      .catch(() => {
        if (!cancelled) setState({ state: "unreachable" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
