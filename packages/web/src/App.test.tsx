import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./lib/apiClient.js";
import { App } from "./App.js";

vi.mock("./lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("./lib/apiClient.js");
  // Never let a unit test hit a real network socket for /health, /api/probability, or /api/sightings.
  return {
    ...actual,
    fetchHealth: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchProbabilityGrid: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchSightings: vi.fn().mockReturnValue(new Promise(() => {})),
  };
});

describe("App", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchSightings).mockReset().mockReturnValue(new Promise(() => {}));
  });

  it("renders the full-screen map — the entire v1 UI is the map plus its overlays", () => {
    render(<App />);
    expect(screen.getByTestId("map-canvas")).toBeInTheDocument();
  });

  it("defaults the time window to 'Last 30 days' (ADR 0003)", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("re-fetches sightings scoped to the newly selected window when a FilterBar chip is clicked", async () => {
    // "Last 90 days," not "Latest reports": RecencyStamp always fetches
    // `window: "latest"` on its own, independent of FilterBar's selection
    // (see its doc comment) — picking a window RecencyStamp never uses
    // keeps this assertion specific to SightingsLayer's wiring.
    render(<App />);

    fireEvent.click(screen.getByText("Last 90 days"));

    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledWith(expect.objectContaining({ window: "90d" })));
    expect(screen.getByRole("button", { name: "Last 90 days" })).toHaveAttribute("aria-pressed", "true");
  });
});
