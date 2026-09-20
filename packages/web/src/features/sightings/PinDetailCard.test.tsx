import { fireEvent, render, screen } from "@testing-library/react";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { describe, expect, it, vi } from "vitest";
import { PinDetailCard } from "./PinDetailCard.js";

describe("PinDetailCard", () => {
  it("renders nothing when no sighting is selected", () => {
    render(<PinDetailCard sighting={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the species as the sheet's title", () => {
    render(<PinDetailCard sighting={buildSighting({ species: "orca" })} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Orca");
  });

  it("shows a tier badge", () => {
    render(<PinDetailCard sighting={buildSighting({ tier: "research" })} onClose={() => {}} />);
    expect(screen.getByText("Research-grade")).toBeInTheDocument();
  });

  it("shows 'Verified' for a verified sighting", () => {
    render(<PinDetailCard sighting={buildSighting({ verification: "verified" })} onClose={() => {}} />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("shows an unverified badge distinctly, per spec.md/ADR 0002's requirement that unverified reports read as visually distinct", () => {
    render(<PinDetailCard sighting={buildSighting({ verification: "unverified" })} onClose={() => {}} />);
    expect(screen.getByText(/unverified/i)).toBeInTheDocument();
  });

  it("shows the observed date, safely formatted even for a full ISO datetime (not just a bare date)", () => {
    render(
      <PinDetailCard sighting={buildSighting({ observedAt: "2026-08-06T13:21:00.000Z" })} onClose={() => {}} />,
    );
    expect(screen.getByText(/Aug 6, 2026/)).toBeInTheDocument();
  });

  it("shows an obscured-coordinates note only when coordinatesObscured is true", () => {
    const { rerender } = render(
      <PinDetailCard sighting={buildSighting({ coordinatesObscured: true })} onClose={() => {}} />,
    );
    expect(screen.getByText(/approximate/i)).toBeInTheDocument();

    rerender(<PinDetailCard sighting={buildSighting({ coordinatesObscured: false })} onClose={() => {}} />);
    expect(screen.queryByText(/approximate/i)).not.toBeInTheDocument();
  });

  it("shows positional uncertainty only when the sighting has one", () => {
    const { rerender } = render(
      <PinDetailCard sighting={buildSighting({ positionalUncertaintyMeters: 150 })} onClose={() => {}} />,
    );
    expect(screen.getByText(/±150 m/)).toBeInTheDocument();

    rerender(<PinDetailCard sighting={buildSighting({ positionalUncertaintyMeters: undefined })} onClose={() => {}} />);
    expect(screen.queryByText(/accuracy/i)).not.toBeInTheDocument();
  });

  it("formats a large positional uncertainty in kilometers", () => {
    render(<PinDetailCard sighting={buildSighting({ positionalUncertaintyMeters: 2500 })} onClose={() => {}} />);
    expect(screen.getByText(/±2\.5 km/)).toBeInTheDocument();
  });

  it("folds an obscured record's uncertainty into the approximate-location note instead of a standalone 'Position accuracy' line, so a geoprivacy placeholder never reads as a measured precision", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({ coordinatesObscured: true, positionalUncertaintyMeters: 111_320 })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/approximate/i)).toHaveTextContent(/within ±111\.3 km/);
    expect(screen.queryByText(/^Position accuracy/)).not.toBeInTheDocument();
  });

  it("shows the seasonality note for a species that has one (gray whale)", () => {
    render(<PinDetailCard sighting={buildSighting({ species: "gray-whale" })} onClose={() => {}} />);
    expect(screen.getByText(/migrat/i)).toBeInTheDocument();
  });

  it("shows no seasonality note for a species without one", () => {
    render(<PinDetailCard sighting={buildSighting({ species: "orca" })} onClose={() => {}} />);
    expect(screen.queryByText(/migrat/i)).not.toBeInTheDocument();
  });

  it("shows the dataset name and publisher", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({
          attribution: {
            datasetName: "Test Dataset",
            datasetId: "test-dataset",
            publisherName: "Test Publisher",
            publisherId: "test-publisher",
            license: { id: "public-domain", commercialUse: true },
          },
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Test Dataset/)).toBeInTheDocument();
    expect(screen.getByText(/Test Publisher/)).toBeInTheDocument();
  });

  it("shows the citation when present", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({
          attribution: {
            datasetName: "Test Dataset",
            datasetId: "test-dataset",
            publisherName: "Test Publisher",
            publisherId: "test-publisher",
            license: { id: "public-domain", commercialUse: true },
            citation: "Some Citation 2026",
          },
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Some Citation 2026")).toBeInTheDocument();
  });

  it("links the license id when a license URL is present", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({
          attribution: {
            datasetName: "Test Dataset",
            datasetId: "test-dataset",
            publisherName: "Test Publisher",
            publisherId: "test-publisher",
            license: { id: "cc-by", commercialUse: true, url: "https://creativecommons.org/licenses/by/4.0/" },
          },
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: "cc-by" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });

  it("shows a link to the original observation when attributionUrl is present", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({
          attribution: {
            datasetName: "Test Dataset",
            datasetId: "test-dataset",
            publisherName: "Test Publisher",
            publisherId: "test-publisher",
            license: { id: "public-domain", commercialUse: true },
            attributionUrl: "https://example.com/observation/1",
          },
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: /view original observation/i })).toHaveAttribute(
      "href",
      "https://example.com/observation/1",
    );
  });

  it("calls onClose when dismissed", () => {
    const onClose = vi.fn();
    render(<PinDetailCard sighting={buildSighting()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
