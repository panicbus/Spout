import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { describe, expect, it, vi } from "vitest";
import { PinDetailCard } from "./PinDetailCard.js";

const ANCHOR = { x: 100, y: 100 };

describe("PinDetailCard", () => {
  it("forwards ref through to the rendered card's root element", () => {
    const ref = createRef<HTMLDivElement>();
    render(<PinDetailCard ref={ref} sighting={buildSighting()} anchor={ANCHOR} onClose={() => {}} />);
    expect(ref.current).toBe(screen.getByRole("dialog"));
  });

  it("renders nothing when no sighting is selected", () => {
    render(<PinDetailCard sighting={null} anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders nothing when a sighting is selected but the anchor hasn't resolved yet", () => {
    render(<PinDetailCard sighting={buildSighting()} anchor={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the species as the card's title, both accessibly and as visible text", () => {
    render(<PinDetailCard sighting={buildSighting({ species: "orca" })} anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Orca");
    expect(screen.getByRole("heading", { name: "Orca" })).toBeInTheDocument();
  });

  it("shows the sighting's photo when photoUrl is present", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({ photoUrl: "https://example.com/whale.jpg" })}
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/whale.jpg");
  });

  it("shows no photo when photoUrl is absent", () => {
    render(<PinDetailCard sighting={buildSighting({ photoUrl: undefined })} anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the Happywhale callout, linking out, when happywhaleUrl is present", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({ happywhaleUrl: "https://happywhale.com/encounter/623491" })}
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: /seen before/i })).toHaveAttribute(
      "href",
      "https://happywhale.com/encounter/623491",
    );
  });

  it("shows no Happywhale callout when happywhaleUrl is absent", () => {
    render(<PinDetailCard sighting={buildSighting({ happywhaleUrl: undefined })} anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.queryByText(/seen before/i)).not.toBeInTheDocument();
  });

  it("shows a species icon distinct per species, presentational (no redundant alt text next to the visible heading)", () => {
    const { container, rerender } = render(
      <PinDetailCard sighting={buildSighting({ species: "orca" })} anchor={ANCHOR} onClose={() => {}} />,
    );
    const orcaIconSrc = container.querySelector("img[alt='']")?.getAttribute("src");
    expect(orcaIconSrc).toBeTruthy();

    rerender(<PinDetailCard sighting={buildSighting({ species: "blue-whale" })} anchor={ANCHOR} onClose={() => {}} />);
    const blueIconSrc = container.querySelector("img[alt='']")?.getAttribute("src");

    expect(blueIconSrc).toBeTruthy();
    expect(blueIconSrc).not.toBe(orcaIconSrc);
  });

  it("shows a tier badge", () => {
    render(<PinDetailCard sighting={buildSighting({ tier: "research" })} anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.getByText("Research-grade")).toBeInTheDocument();
  });

  it("shows 'Verified' for a verified sighting", () => {
    render(<PinDetailCard sighting={buildSighting({ verification: "verified" })} anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("shows an unverified badge distinctly, per spec.md/ADR 0002's requirement that unverified reports read as visually distinct", () => {
    render(
      <PinDetailCard sighting={buildSighting({ verification: "unverified" })} anchor={ANCHOR} onClose={() => {}} />,
    );
    expect(screen.getByText(/unverified/i)).toBeInTheDocument();
  });

  it("shows the observed date, safely formatted even for a full ISO datetime (not just a bare date)", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({ observedAt: "2026-08-06T13:21:00.000Z" })}
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Aug 6, 2026/)).toBeInTheDocument();
  });

  it("shows an obscured-coordinates note only when coordinatesObscured is true", () => {
    const { rerender } = render(
      <PinDetailCard sighting={buildSighting({ coordinatesObscured: true })} anchor={ANCHOR} onClose={() => {}} />,
    );
    expect(screen.getByText(/approximate/i)).toBeInTheDocument();

    rerender(
      <PinDetailCard sighting={buildSighting({ coordinatesObscured: false })} anchor={ANCHOR} onClose={() => {}} />,
    );
    expect(screen.queryByText(/approximate/i)).not.toBeInTheDocument();
  });

  it("shows positional uncertainty only when the sighting has one", () => {
    const { rerender } = render(
      <PinDetailCard
        sighting={buildSighting({ positionalUncertaintyMeters: 150 })}
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/±150 m/)).toBeInTheDocument();

    rerender(
      <PinDetailCard
        sighting={buildSighting({ positionalUncertaintyMeters: undefined })}
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/accuracy/i)).not.toBeInTheDocument();
  });

  it("formats a large positional uncertainty in kilometers", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({ positionalUncertaintyMeters: 2500 })}
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/±2\.5 km/)).toBeInTheDocument();
  });

  it("folds an obscured record's uncertainty into the approximate-location note instead of a standalone 'Position accuracy' line, so a geoprivacy placeholder never reads as a measured precision", () => {
    render(
      <PinDetailCard
        sighting={buildSighting({ coordinatesObscured: true, positionalUncertaintyMeters: 111_320 })}
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/approximate/i)).toHaveTextContent(/within ±111\.3 km/);
    expect(screen.queryByText(/^Position accuracy/)).not.toBeInTheDocument();
  });

  it("shows the seasonality note for a species that has one (gray whale)", () => {
    render(<PinDetailCard sighting={buildSighting({ species: "gray-whale" })} anchor={ANCHOR} onClose={() => {}} />);
    expect(screen.getByText(/migrat/i)).toBeInTheDocument();
  });

  it("shows no seasonality note for a species without one", () => {
    render(<PinDetailCard sighting={buildSighting({ species: "orca" })} anchor={ANCHOR} onClose={() => {}} />);
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
        anchor={ANCHOR}
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
        anchor={ANCHOR}
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
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: "cc-by" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });

  it("renders the license inline in the same footer line as the dataset/publisher attribution, not as a separate line", () => {
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
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    const footerLine = screen.getByText(/Test Dataset/).closest("p");
    expect(footerLine).not.toBeNull();
    expect(footerLine).toHaveTextContent("Test Dataset via Test Publisher · License public-domain");
  });

  it("shows a 'view original' link inline with the dataset/publisher line when attributionUrl is present", () => {
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
        anchor={ANCHOR}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Test Dataset via Test Publisher \(/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "view original" })).toHaveAttribute(
      "href",
      "https://example.com/observation/1",
    );
  });

  it("calls onClose when dismissed", () => {
    const onClose = vi.fn();
    render(<PinDetailCard sighting={buildSighting()} anchor={ANCHOR} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
