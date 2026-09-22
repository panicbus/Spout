import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateControl } from "./DateControl.js";

describe("DateControl", () => {
  it("shows the given value", () => {
    render(<DateControl value="2026-09-12" onChange={() => {}} />);
    expect(screen.getByDisplayValue("2026-09-12")).toBeInTheDocument();
  });

  it("calls onChange with the new date when changed", () => {
    const onChange = vi.fn();
    render(<DateControl value="2026-09-12" onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue("2026-09-12"), { target: { value: "2026-12-25" } });

    expect(onChange).toHaveBeenCalledWith("2026-12-25");
  });

  it("does not call onChange when cleared to an empty value", () => {
    const onChange = vi.fn();
    render(<DateControl value="2026-09-12" onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue("2026-09-12"), { target: { value: "" } });

    expect(onChange).not.toHaveBeenCalled();
  });
});
