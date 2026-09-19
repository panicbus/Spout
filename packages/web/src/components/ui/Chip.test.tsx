import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip.js";

describe("Chip", () => {
  it("renders its label", () => {
    render(
      <Chip selected={false} onClick={() => {}}>
        Last 30 days
      </Chip>,
    );
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(
      <Chip selected={false} onClick={onClick}>
        Latest reports
      </Chip>,
    );
    fireEvent.click(screen.getByText("Latest reports"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("exposes selected state via aria-pressed, for screen readers and for tests alike", () => {
    render(
      <Chip selected onClick={() => {}}>
        Last 30 days
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks itself unselected via aria-pressed=false", () => {
    render(
      <Chip selected={false} onClick={() => {}}>
        Last 90 days
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Last 90 days" })).toHaveAttribute("aria-pressed", "false");
  });
});
