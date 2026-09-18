import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./apiClient.js";
import { useApiHealth } from "./useApiHealth.js";

vi.mock("./apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("./apiClient.js");
  return { ...actual, fetchHealth: vi.fn() };
});

describe("useApiHealth", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchHealth).mockReset();
  });

  it("starts in the 'checking' state", () => {
    vi.mocked(apiClient.fetchHealth).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useApiHealth());
    expect(result.current.state).toBe("checking");
  });

  it("moves to 'ok' with the health payload once the fetch resolves", async () => {
    vi.mocked(apiClient.fetchHealth).mockResolvedValue({
      status: "ok",
      timestamp: "2026-09-18T00:00:00.000Z",
    });

    const { result } = renderHook(() => useApiHealth());

    await waitFor(() => expect(result.current.state).toBe("ok"));
    expect(result.current.state === "ok" && result.current.health.status).toBe("ok");
  });

  it("moves to 'unreachable' when the fetch rejects, instead of throwing out of the component", async () => {
    vi.mocked(apiClient.fetchHealth).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useApiHealth());

    await waitFor(() => expect(result.current.state).toBe("unreachable"));
  });
});
