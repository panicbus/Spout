import type { ReactNode } from "react";
import { render, renderHook, waitFor } from "@testing-library/react";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./apiClient.js";
import { useProbabilityGrid } from "./ProbabilityGridContext.js";
import { ProbabilityGridProvider } from "./ProbabilityGridProvider.js";

vi.mock("./apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("./apiClient.js");
  return { ...actual, fetchProbabilityGrid: vi.fn() };
});

function wrapper({ children }: { children: ReactNode }) {
  return <ProbabilityGridProvider>{children}</ProbabilityGridProvider>;
}

describe("useProbabilityGrid / ProbabilityGridProvider", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReset();
  });

  it("starts in the 'loading' state", () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useProbabilityGrid(), { wrapper });
    expect(result.current.state).toBe("loading");
  });

  it("moves to 'ok' with the grid once the fetch resolves", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(
      buildProbabilityGrid({ modelDate: "2026-09-15" }),
    );

    const { result } = renderHook(() => useProbabilityGrid(), { wrapper });

    await waitFor(() => expect(result.current.state).toBe("ok"));
    expect(result.current.state === "ok" && result.current.data.modelDate).toBe("2026-09-15");
  });

  it("moves to 'error' when the fetch rejects", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockRejectedValue(new Error("503"));

    const { result } = renderHook(() => useProbabilityGrid(), { wrapper });

    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("throws when used outside the provider, rather than silently issuing its own fetch", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useProbabilityGrid())).toThrow(/ProbabilityGridProvider/);
    consoleError.mockRestore();
  });

  it("fetches only once even when two separate consumers both read the context (the duplicate-request bug this replaces)", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(buildProbabilityGrid());

    function ConsumerA() {
      const result = useProbabilityGrid();
      return <span>A:{result.state}</span>;
    }
    function ConsumerB() {
      const result = useProbabilityGrid();
      return <span>B:{result.state}</span>;
    }

    render(
      <ProbabilityGridProvider>
        <ConsumerA />
        <ConsumerB />
      </ProbabilityGridProvider>,
    );

    await waitFor(() => expect(apiClient.fetchProbabilityGrid).toHaveBeenCalledTimes(1));
  });
});
