import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./apiClient.js";
import { useSeasonality } from "./useSeasonality.js";

vi.mock("./apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("./apiClient.js");
  return { ...actual, fetchSeasonality: vi.fn() };
});

describe("useSeasonality", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchSeasonality).mockReset();
  });

  it("starts idle (not loading) when there's no tap", () => {
    const { result } = renderHook(() => useSeasonality(null));
    expect(result.current.state).toBe("idle");
    expect(apiClient.fetchSeasonality).not.toHaveBeenCalled();
  });

  it("fetches once a tap is provided, and moves to 'ok' with the result", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({ month: 9, species: [] });

    const { result } = renderHook(() => useSeasonality({ lat: 36.6, lon: -121.9, date: "2026-09-12" }));

    expect(apiClient.fetchSeasonality).toHaveBeenCalledWith(36.6, -121.9, "2026-09-12");
    await waitFor(() => expect(result.current.state).toBe("ok"));
  });

  it("moves to 'error' when the fetch rejects", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockRejectedValue(new Error("503"));

    const { result } = renderHook(() => useSeasonality({ lat: 36.6, lon: -121.9, date: "2026-09-12" }));

    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("returns to 'idle' when the tap is cleared", () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({ month: 9, species: [] });

    const { result, rerender } = renderHook(({ tap }) => useSeasonality(tap), {
      initialProps: { tap: { lat: 36.6, lon: -121.9, date: "2026-09-12" } as { lat: number; lon: number; date: string } | null },
    });

    rerender({ tap: null });

    expect(result.current.state).toBe("idle");
  });

  it("refetches when the tapped location changes", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({ month: 9, species: [] });

    const { rerender } = renderHook(({ tap }) => useSeasonality(tap), {
      initialProps: { tap: { lat: 36.6, lon: -121.9, date: "2026-09-12" } },
    });
    await waitFor(() => expect(apiClient.fetchSeasonality).toHaveBeenCalledTimes(1));

    rerender({ tap: { lat: 40.0, lon: -124.0, date: "2026-09-12" } });

    await waitFor(() => expect(apiClient.fetchSeasonality).toHaveBeenCalledTimes(2));
  });
});
