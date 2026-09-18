import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiStatusIndicator } from "./ApiStatusIndicator.js";
import * as apiClient from "../lib/apiClient.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("../lib/apiClient.js");
  return { ...actual, fetchHealth: vi.fn() };
});

describe("ApiStatusIndicator", () => {
  it("shows a neutral 'checking' badge before the health check resolves", () => {
    vi.mocked(apiClient.fetchHealth).mockReturnValue(new Promise(() => {}));
    render(<ApiStatusIndicator />);
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });

  it("shows an 'ok' badge once the API responds healthy", async () => {
    vi.mocked(apiClient.fetchHealth).mockResolvedValue({
      status: "ok",
      timestamp: "2026-09-18T00:00:00.000Z",
    });
    render(<ApiStatusIndicator />);
    await waitFor(() => expect(screen.getByText(/api connected/i)).toBeInTheDocument());
  });

  it("shows an 'error' badge when the API is unreachable", async () => {
    vi.mocked(apiClient.fetchHealth).mockRejectedValue(new Error("network error"));
    render(<ApiStatusIndicator />);
    await waitFor(() => expect(screen.getByText(/api unreachable/i)).toBeInTheDocument());
  });
});
