import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./apiClient.js";
import { useSeasonalityYear } from "./useSeasonalityYear.js";

vi.mock("./apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("./apiClient.js");
  return { ...actual, fetchSeasonalityYear: vi.fn() };
});

describe("useSeasonalityYear", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchSeasonalityYear).mockReset();
  });

  it("starts idle (not loading) when there's no tap — the year view is opt-in, not fetched on every tap", () => {
    const { result } = renderHook(() => useSeasonalityYear(null));
    expect(result.current.state).toBe("idle");
    expect(apiClient.fetchSeasonalityYear).not.toHaveBeenCalled();
  });

  it("fetches once a tap is provided, and moves to 'ok' with the result", async () => {
    vi.mocked(apiClient.fetchSeasonalityYear).mockResolvedValue({ species: [] });

    const { result } = renderHook(() => useSeasonalityYear({ lat: 36.6, lon: -121.9 }));

    expect(apiClient.fetchSeasonalityYear).toHaveBeenCalledWith(36.6, -121.9);
    await waitFor(() => expect(result.current.state).toBe("ok"));
  });

  it("moves to 'error' when the fetch rejects", async () => {
    vi.mocked(apiClient.fetchSeasonalityYear).mockRejectedValue(new Error("503"));

    const { result } = renderHook(() => useSeasonalityYear({ lat: 36.6, lon: -121.9 }));

    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("refetches when the tapped location changes", async () => {
    vi.mocked(apiClient.fetchSeasonalityYear).mockResolvedValue({ species: [] });

    const { rerender } = renderHook(({ tap }) => useSeasonalityYear(tap), {
      initialProps: { tap: { lat: 36.6, lon: -121.9 } },
    });
    await waitFor(() => expect(apiClient.fetchSeasonalityYear).toHaveBeenCalledTimes(1));

    rerender({ tap: { lat: 40.0, lon: -124.0 } });

    await waitFor(() => expect(apiClient.fetchSeasonalityYear).toHaveBeenCalledTimes(2));
  });
});
