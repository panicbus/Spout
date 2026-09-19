import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "./FilterBar.js";

describe("FilterBar", () => {
  it("renders a chip for every TIME_WINDOW option, with human-readable labels", () => {
    render(<FilterBar value="30d" onChange={() => {}} />);

    expect(screen.getByText("Latest reports")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Last 90 days")).toBeInTheDocument();
    expect(screen.getByText("Last 12 months")).toBeInTheDocument();
  });

  it("marks the chip matching `value` as selected, and no other", () => {
    render(<FilterBar value="latest" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Latest reports" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the clicked window's value", () => {
    const onChange = vi.fn();
    render(<FilterBar value="30d" onChange={onChange} />);

    fireEvent.click(screen.getByText("Last 90 days"));

    expect(onChange).toHaveBeenCalledWith("90d");
  });

  it("is a controlled component — clicking a chip does not change the selection until `value` itself changes", () => {
    const onChange = vi.fn();
    render(<FilterBar value="30d" onChange={onChange} />);

    fireEvent.click(screen.getByText("Last 12 months"));

    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Last 12 months" })).toHaveAttribute("aria-pressed", "false");
  });
});
