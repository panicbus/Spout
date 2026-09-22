import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "../../lib/apiClient.js";
import { SeasonalityCard } from "./SeasonalityCard.js";

vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("../../lib/apiClient.js");
  return { ...actual, fetchSeasonality: vi.fn() };
});

const ANCHOR = { x: 100, y: 100 };
const LNG_LAT: [number, number] = [-121.9, 36.6];

describe("SeasonalityCard", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchSeasonality).mockReset();
  });

  it("renders nothing when lngLat is null", () => {
    render(<SeasonalityCard lngLat={null} date="2026-09-12" anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a loading state while the fetch is in flight", () => {
    vi.mocked(apiClient.fetchSeasonality).mockReturnValue(new Promise(() => {}));
    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });

  it("shows the species breakdown sorted by share descending, with the month name", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({
      month: 9,
      species: [
        { species: "blue-whale", share: 0.02, sampleSize: 8387 },
        { species: "humpback-whale", share: 0.86, sampleSize: 8387 },
        { species: "gray-whale", share: 0, sampleSize: 8387 },
        { species: "orca", share: 0.018, sampleSize: 8387 },
      ],
    });

    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={() => {}} />);

    expect(await screen.findByText("September")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows[0]).toMatch(/Humpback Whale.*86%/);
    expect(rows[3]).toMatch(/Gray Whale.*not reported/);
  });

  it("shows an honest insufficient-data message instead of a list of dashes when the sample is too small", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({
      month: 6,
      species: [
        { species: "blue-whale", share: undefined, sampleSize: 0 },
        { species: "humpback-whale", share: undefined, sampleSize: 0 },
        { species: "gray-whale", share: undefined, sampleSize: 0 },
        { species: "orca", share: undefined, sampleSize: 0 },
      ],
    });

    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-06-15" anchor={ANCHOR} onClose={() => {}} />);

    expect(await screen.findByText(/not enough reported whale sightings/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockRejectedValue(new Error("503"));

    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={() => {}} />);

    expect(await screen.findByText(/couldn.t load/i)).toBeInTheDocument();
  });

  it("calls onClose when dismissed", () => {
    vi.mocked(apiClient.fetchSeasonality).mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
