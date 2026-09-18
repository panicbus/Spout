import type { Sighting, SightingsQuery } from "@spout/contracts";
import { useMemo } from "react";
import { fetchSightings } from "./apiClient.js";
import { useFetch, type FetchState } from "./useFetch.js";

/**
 * Fetches sightings for `params`, refetching when the *values* in
 * `params` change — not merely when the caller passes a new object
 * reference. Callers building `params` inline as an object literal
 * (`useSightings({ species: ["orca"] })`) get a new reference every
 * render; without this, `useFetch`'s dependency array (which needs a
 * stable primitive to compare) would either refetch on every render or
 * never refetch depending on how it's wired. Serializing to JSON for the
 * dependency comparison is safe here because `SightingsQuery` is only
 * primitives and arrays of primitives.
 */
export function useSightings(params: Partial<SightingsQuery>): FetchState<Sighting[]> {
  const paramsKey = JSON.stringify(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- paramsKey IS the intentional, exhaustive dependency; re-deriving params from it would just recreate the same object every render
  const stableParams = useMemo(() => params, [paramsKey]);

  return useFetch(() => fetchSightings(stableParams), [paramsKey]);
}
