import { useEffect, useRef, useState, type DependencyList } from "react";

export type FetchState<T> =
  | { state: "loading" }
  | { state: "ok"; data: T }
  | { state: "error"; error: unknown };

/**
 * Runs `fetcher` on mount and whenever `deps` changes, exposing the
 * result as three explicit states rather than a bare loading boolean +
 * nullable data. "error" is a real, expected state for every caller of
 * this hook (an offline user, an API that's briefly down) — the point of
 * this hook existing is that no feature has to hand-roll that handling
 * itself. Used by `useApiHealth` and `useProbabilityGrid`; reach for it
 * again in R2/R3 for sightings/citizen fetches rather than another
 * bespoke loading-state hook.
 */
export function useFetch<T>(fetcher: () => Promise<T>, deps: DependencyList = []): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ state: "loading" });
  const isFirstRun = useRef(true);

  useEffect(() => {
    let cancelled = false;

    // Skip the redundant "reset to loading" on mount — state is already
    // `{ state: "loading" }` from useState's initializer, so setting it
    // again there is a wasted render, not a real transition. Only a
    // later re-run (deps changed, e.g. a bbox filter) needs to flip a
    // settled "ok"/"error" state back to "loading".
    if (isFirstRun.current) {
      isFirstRun.current = false;
    } else {
      setState({ state: "loading" });
    }

    fetcher()
      .then((data) => {
        if (!cancelled) setState({ state: "ok", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ state: "error", error });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the caller's explicit dependency list, not fetcher's own closure
  }, deps);

  return state;
}
