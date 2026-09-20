import { createContext, useContext } from "react";
import type { ProbabilityGrid } from "@spout/contracts";
import type { FetchState } from "./useFetch.js";

/**
 * Holds the one shared WhaleWatch 2.0 fetch result — see
 * `ProbabilityGridProvider.tsx` (the component that actually runs the
 * fetch) for why this is a context rather than each consumer calling
 * `useFetch` itself.
 */
export const ProbabilityGridContext = createContext<FetchState<ProbabilityGrid> | null>(null);
export const ProbabilityGridContextProvider = ProbabilityGridContext.Provider;

/** The shared WhaleWatch 2.0 fetch result. Must be used under `ProbabilityGridProvider`. */
export function useProbabilityGrid(): FetchState<ProbabilityGrid> {
  const result = useContext(ProbabilityGridContext);
  if (result === null) {
    throw new Error("useProbabilityGrid must be used within a ProbabilityGridProvider");
  }
  return result;
}
