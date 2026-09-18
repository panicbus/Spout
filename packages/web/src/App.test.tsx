import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as apiClient from "./lib/apiClient.js";
import { App } from "./App.js";

vi.mock("./lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("./lib/apiClient.js");
  // Never let a unit test hit a real network socket for /health or /api/probability.
  return {
    ...actual,
    fetchHealth: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchProbabilityGrid: vi.fn().mockReturnValue(new Promise(() => {})),
  };
});

describe("App", () => {
  it("renders the full-screen map — the entire v1 UI is the map plus its overlays", () => {
    render(<App />);
    expect(screen.getByTestId("map-canvas")).toBeInTheDocument();
  });
});
