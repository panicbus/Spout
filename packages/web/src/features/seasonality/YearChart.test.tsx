import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SeasonalityYearResponse } from "@spout/contracts";
import { YearChart } from "./YearChart.js";

function buildYearData(overrides: Partial<SeasonalityYearResponse> = {}): SeasonalityYearResponse {
  return {
    species: [
      {
        species: "humpback-whale",
        months: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          share: i >= 6 && i <= 9 ? 0.8 : 0.05, // Jul-Oct peak
          sampleSize: 500,
        })),
      },
    ],
    ...overrides,
  };
}

describe("YearChart", () => {
  it("renders one row per species, with a species label and icon", () => {
    render(<YearChart data={buildYearData()} currentMonth={9} />);
    expect(screen.getByText("Humpback Whale")).toBeInTheDocument();
  });

  it("renders 12 bars per species, one for each month", () => {
    const { container } = render(<YearChart data={buildYearData()} currentMonth={9} />);
    const bars = container.querySelectorAll('[title^="January"], [title^="February"], [title^="March"], [title^="April"], [title^="May"], [title^="June"], [title^="July"], [title^="August"], [title^="September"], [title^="October"], [title^="November"], [title^="December"]');
    expect(bars).toHaveLength(12);
  });

  it("renders a month with no share (insufficient sample) as a distinct empty placeholder, not a fabricated zero-height bar", () => {
    const data = buildYearData({
      species: [
        {
          species: "gray-whale",
          months: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            share: i === 5 ? undefined : 0.3, // June: not enough data
            sampleSize: i === 5 ? 2 : 200,
          })),
        },
      ],
    });

    const { container } = render(<YearChart data={data} currentMonth={1} />);

    const juneBar = container.querySelector('[title^="June"]');
    expect(juneBar?.getAttribute("title")).toContain("not enough data");
    // A real, defined-share month has an inline height style; the
    // insufficient-sample month deliberately does not (styled instead via
    // its own CSS class), so this distinguishes the two without relying
    // on CSS module class names.
    expect(juneBar).not.toHaveAttribute("style");
    const julyBar = container.querySelector('[title^="July"]');
    expect(julyBar).toHaveAttribute("style");
  });
});
