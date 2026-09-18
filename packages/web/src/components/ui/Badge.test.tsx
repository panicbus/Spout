import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge.js";

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge tone="ok" label="API connected" />);
    expect(screen.getByText("API connected")).toBeInTheDocument();
  });

  it("exposes its tone for styling and for tests, without hardcoding color logic per call site", () => {
    render(<Badge tone="error" label="API unreachable" />);
    expect(screen.getByText("API unreachable").closest("[data-tone]")).toHaveAttribute(
      "data-tone",
      "error",
    );
  });
});
