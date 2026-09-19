import { render, screen, waitFor } from "@testing-library/react";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "../../lib/apiClient.js";
import { RecencyStamp } from "./RecencyStamp.js";

vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("../../lib/apiClient.js");
  return { ...actual, fetchSightings: vi.fn() };
});

const NOW = new Date("2026-09-19T12:00:00.000Z");

describe("RecencyStamp", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchSightings).mockReset();
  });

  it("fetches the 'latest' (7-day) window independent of any user-selected filter", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([]);

    render(<RecencyStamp now={NOW} />);

    await waitFor(() => expect(apiClient.fetchSightings).toHaveBeenCalledWith({ window: "latest" }));
  });

  it("shows the most recent report's age, computed across the fetched sightings", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([
      buildSighting({ observedAt: "2026-09-17T12:00:00.000Z" }),
      buildSighting({ observedAt: "2026-09-15T12:00:00.000Z" }),
    ]);

    render(<RecencyStamp now={NOW} />);

    await waitFor(() => expect(screen.getByText(/most recent report/i)).toBeInTheDocument());
    expect(screen.getByText(/2 days ago/i)).toBeInTheDocument();
  });

  it("reads honestly when there's nothing in the last 7 days, rather than a broken/blank stamp (ADR 0003)", async () => {
    vi.mocked(apiClient.fetchSightings).mockResolvedValue([]);

    render(<RecencyStamp now={NOW} />);

    await waitFor(() => expect(screen.getByText(/no reports in the last 7 days/i)).toBeInTheDocument());
  });

  it("renders nothing while loading", () => {
    vi.mocked(apiClient.fetchSightings).mockReturnValue(new Promise(() => {}));

    render(<RecencyStamp now={NOW} />);

    expect(screen.queryByText(/report/i)).not.toBeInTheDocument();
  });
});
