import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stamp } from "./Stamp.js";

describe("Stamp", () => {
  it("renders its children as a small overlay caption", () => {
    render(<Stamp>Blue whale probability — Sep 15, 2026</Stamp>);
    expect(screen.getByText("Blue whale probability — Sep 15, 2026")).toBeInTheDocument();
  });
});
