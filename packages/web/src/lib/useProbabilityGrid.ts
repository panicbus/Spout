import { fetchProbabilityGrid } from "./apiClient.js";
import { useFetch, type FetchState } from "./useFetch.js";
import type { ProbabilityGrid } from "@spout/contracts";

/** Fetches the current WhaleWatch 2.0 probability grid once on mount. */
export function useProbabilityGrid(): FetchState<ProbabilityGrid> {
  return useFetch(fetchProbabilityGrid);
}
