import { renderHook, waitFor } from "@testing-library/react";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./apiClient.js";
import { useProbabilityGrid } from "./useProbabilityGrid.js";

vi.mock("./apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("./apiClient.js");
  return { ...actual, fetchProbabilityGrid: vi.fn() };
});

describe("useProbabilityGrid", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReset();
  });

  it("starts in the 'loading' state", () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useProbabilityGrid());
    expect(result.current.state).toBe("loading");
  });

  it("moves to 'ok' with the grid once the fetch resolves", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(
      buildProbabilityGrid({ modelDate: "2026-09-15" }),
    );

    const { result } = renderHook(() => useProbabilityGrid());

    await waitFor(() => expect(result.current.state).toBe("ok"));
    expect(result.current.state === "ok" && result.current.data.modelDate).toBe("2026-09-15");
  });

  it("moves to 'error' when the fetch rejects", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockRejectedValue(new Error("503"));

    const { result } = renderHook(() => useProbabilityGrid());

    await waitFor(() => expect(result.current.state).toBe("error"));
  });
});
