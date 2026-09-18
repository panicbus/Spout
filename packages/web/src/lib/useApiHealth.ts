import type { HealthStatus } from "@spout/contracts";
import { fetchHealth } from "./apiClient.js";
import { useFetch } from "./useFetch.js";

export type ApiHealthState =
  | { state: "checking" }
  | { state: "ok"; health: HealthStatus }
  | { state: "unreachable" };

/**
 * A thin adapter over `useFetch` that keeps this hook's own vocabulary
 * ("checking"/"unreachable" read better than "loading"/"error" for a
 * connectivity indicator specifically) without duplicating the
 * fetch-on-mount/cancel-on-unmount logic `useFetch` already owns.
 */
export function useApiHealth(): ApiHealthState {
  const result = useFetch(fetchHealth);

  switch (result.state) {
    case "loading":
      return { state: "checking" };
    case "ok":
      return { state: "ok", health: result.data };
    case "error":
      return { state: "unreachable" };
  }
}
