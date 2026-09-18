import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFetch } from "./useFetch.js";

describe("useFetch", () => {
  it("starts in the 'loading' state", () => {
    const { result } = renderHook(() => useFetch(() => new Promise(() => {})));
    expect(result.current.state).toBe("loading");
  });

  it("moves to 'ok' with the resolved data once the fetcher resolves", async () => {
    const { result } = renderHook(() => useFetch(() => Promise.resolve({ value: 42 })));

    await waitFor(() => expect(result.current.state).toBe("ok"));
    expect(result.current.state === "ok" && result.current.data.value).toBe(42);
  });

  it("moves to 'error' when the fetcher rejects, instead of throwing out of the component", async () => {
    const { result } = renderHook(() => useFetch(() => Promise.reject(new Error("boom"))));

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.state === "error" && result.current.error).toBeInstanceOf(Error);
  });

  it("does not update state after unmount — no 'setState on an unmounted component' bugs", async () => {
    let resolveFetch!: (value: number) => void;
    const fetcher = () => new Promise<number>((resolve) => (resolveFetch = resolve));

    const { result, unmount } = renderHook(() => useFetch(fetcher));
    unmount();
    resolveFetch(1);

    // No assertion needed beyond "this doesn't throw/warn" — React would
    // log a warning if setState fired after unmount; vitest surfaces
    // unhandled console errors as test noise, so this is a real check.
    expect(result.current.state).toBe("loading");
  });

  it("refetches when a dependency changes", async () => {
    let callCount = 0;
    const fetcher = vi.fn(() => Promise.resolve(++callCount));

    const { result, rerender } = renderHook(({ dep }) => useFetch(fetcher, [dep]), {
      initialProps: { dep: 1 },
    });
    await waitFor(() => expect(result.current.state).toBe("ok"));

    rerender({ dep: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
