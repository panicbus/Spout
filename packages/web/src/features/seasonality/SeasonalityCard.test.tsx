import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "../../lib/apiClient.js";
import { SeasonalityCard } from "./SeasonalityCard.js";

vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("../../lib/apiClient.js");
  return { ...actual, fetchSeasonality: vi.fn(), fetchSeasonalityYear: vi.fn() };
});

const ANCHOR = { x: 100, y: 100 };
const LNG_LAT: [number, number] = [-121.9, 36.6];

describe("SeasonalityCard", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchSeasonality).mockReset();
    vi.mocked(apiClient.fetchSeasonalityYear).mockReset();
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

  it("shows the species breakdown sorted by share descending, with the month name and (when present) each species' modeled ECMM density", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({
      month: 9,
      species: [
        { species: "blue-whale", share: 0.02, sampleSize: 8387 },
        { species: "humpback-whale", share: 0.86, sampleSize: 8387, estimatedDensity: 2.58 },
        { species: "gray-whale", share: 0, sampleSize: 8387 },
        { species: "orca", share: 0.018, sampleSize: 8387 },
      ],
    });

    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={() => {}} />);

    expect(await screen.findByText("September")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    // formatDensity rounds to 1 decimal at/above 1 (2.58 -> "2.6"), 2 decimals below it.
    expect(rows[0]).toMatch(/Humpback Whale.*2\.6 modeled.*86%/);
    expect(rows[3]).toMatch(/Gray Whale.*not reported/);
    // Blue whale has no estimatedDensity in this fixture — no density text leaks onto its row.
    expect(rows.find((r) => r?.includes("Blue Whale"))).not.toMatch(/modeled/);
    expect(screen.getByText(/Duke\/NOAA/)).toBeInTheDocument();
  });

  it("omits the ECMM attribution note when no species has a modeled density (outside its Atlantic/Gulf coverage)", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({
      month: 9,
      species: [{ species: "humpback-whale", share: 0.5, sampleSize: 100 }],
    });

    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={() => {}} />);

    await screen.findByText("September");
    expect(screen.queryByText(/Duke\/NOAA/)).not.toBeInTheDocument();
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

  it("does not fetch the year view until the toggle is clicked, then shows it", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({
      month: 9,
      species: [{ species: "humpback-whale", share: 0.86, sampleSize: 100 }],
    });
    vi.mocked(apiClient.fetchSeasonalityYear).mockResolvedValue({
      species: [
        {
          species: "humpback-whale",
          months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, share: 0.1, sampleSize: 100 })),
        },
      ],
    });

    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={() => {}} />);
    await screen.findByText("September");
    expect(apiClient.fetchSeasonalityYear).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /show full year/i }));

    expect(apiClient.fetchSeasonalityYear).toHaveBeenCalledWith(36.6, -121.9);
    await screen.findByRole("button", { name: /hide full year/i });
  });

  it("collapses the year view when the toggle is clicked again", async () => {
    vi.mocked(apiClient.fetchSeasonality).mockResolvedValue({
      month: 9,
      species: [{ species: "humpback-whale", share: 0.86, sampleSize: 100 }],
    });
    vi.mocked(apiClient.fetchSeasonalityYear).mockResolvedValue({
      species: [
        {
          species: "humpback-whale",
          months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, share: 0.1, sampleSize: 100 })),
        },
      ],
    });

    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={() => {}} />);
    await screen.findByText("September");
    fireEvent.click(screen.getByRole("button", { name: /show full year/i }));
    await screen.findByRole("button", { name: /hide full year/i });

    fireEvent.click(screen.getByRole("button", { name: /hide full year/i }));

    expect(screen.queryByRole("button", { name: /hide full year/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show full year/i })).toBeInTheDocument();
  });

  it("calls onClose when dismissed", () => {
    vi.mocked(apiClient.fetchSeasonality).mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    render(<SeasonalityCard lngLat={LNG_LAT} date="2026-09-12" anchor={ANCHOR} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
