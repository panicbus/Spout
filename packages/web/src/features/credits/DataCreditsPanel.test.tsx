import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "../../lib/apiClient.js";
import { ProbabilityGridProvider } from "../../lib/ProbabilityGridProvider.js";
import { DataCreditsPanel } from "./DataCreditsPanel.js";

vi.mock("../../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof apiClient>("../../lib/apiClient.js");
  return { ...actual, fetchProbabilityGrid: vi.fn() };
});

function renderPanel() {
  return render(
    <ProbabilityGridProvider>
      <DataCreditsPanel />
    </ProbabilityGridProvider>,
  );
}

describe("DataCreditsPanel", () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReset();
  });

  it("renders a trigger button with the panel closed by default", () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /data sources/i })).toBeInTheDocument();
  });

  it("opens the panel when the trigger is clicked", () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReturnValue(new Promise(() => {}));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /data sources/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a loading placeholder while the grid is still in flight, rather than hardcoding the publisher name a second time", () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReturnValue(new Promise(() => {}));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /data sources/i }));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/NOAA WhaleWatch 2.0/)).not.toBeInTheDocument();
  });

  it("shows the real NOAA attribution once the probability grid loads, rather than a hand-copied second version of it (single source of truth: the fetched attribution)", async () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockResolvedValue(
      buildProbabilityGrid({
        attribution: {
          datasetName: "WhaleWatch 2.0 blue whale habitat suitability",
          datasetId: "whalewatch2-blue-whale-ensemble",
          publisherName: "NOAA WhaleWatch 2.0",
          publisherId: "noaa-whalewatch2",
          citation: "Abrahms et al. 2019, Diversity & Distributions, doi:10.1111/ddi.12940.",
          attributionUrl: "https://coastwatch.pfeg.noaa.gov/projects/whalewatch2/about_whalewatch2.html",
          license: { id: "public-domain", commercialUse: true },
        },
      }),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /data sources/i }));

    await waitFor(() => expect(screen.getByText(/Abrahms et al\. 2019/)).toBeInTheDocument());
    expect(screen.getByText(/NOAA WhaleWatch 2.0/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /about this model/i })).toHaveAttribute(
      "href",
      "https://coastwatch.pfeg.noaa.gov/projects/whalewatch2/about_whalewatch2.html",
    );
  });

  it("discloses the model's grid resolution, credits GBIF/iNaturalist for sightings, credits Duke's ECMM habitat models, and credits the map tile provider", () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReturnValue(new Promise(() => {}));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /data sources/i }));
    expect(screen.getByText(/0\.1/)).toBeInTheDocument();
    expect(screen.getByText(/GBIF/)).toBeInTheDocument();
    expect(screen.getByText(/iNaturalist/)).toBeInTheDocument();
    expect(screen.getByText(/Duke University/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY 4.0/)).toBeInTheDocument();
    expect(screen.getByText(/OpenFreeMap/)).toBeInTheDocument();
  });

  it("closes when dismissed", () => {
    vi.mocked(apiClient.fetchProbabilityGrid).mockReturnValue(new Promise(() => {}));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /data sources/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
