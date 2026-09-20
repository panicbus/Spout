import type { ReactNode } from "react";
import { fetchProbabilityGrid } from "./apiClient.js";
import { ProbabilityGridContextProvider } from "./ProbabilityGridContext.js";
import { useFetch } from "./useFetch.js";

/**
 * Fetches the WhaleWatch 2.0 probability grid exactly once and shares the
 * result — `ProbabilityLayer` (the map raster) and `DataCreditsPanel`
 * (the NOAA citation) both need it, and `useFetch` has no caching of its
 * own, so two independent `useProbabilityGrid()` calls issued two full,
 * separate `GET /api/probability` requests on every page load before this
 * existed. Wrap both consumers under this provider (see `App.tsx`)
 * instead of calling `useFetch(fetchProbabilityGrid)` a second time.
 */
export function ProbabilityGridProvider({ children }: { children: ReactNode }) {
  const result = useFetch(fetchProbabilityGrid);
  return <ProbabilityGridContextProvider value={result}>{children}</ProbabilityGridContextProvider>;
}
