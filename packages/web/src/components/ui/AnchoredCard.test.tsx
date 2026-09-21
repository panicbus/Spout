import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AnchoredCard } from "./AnchoredCard.js";

describe("AnchoredCard", () => {
  it("forwards ref to the card's own root element — SightingsLayer measures it to pan the map into view", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <AnchoredCard ref={ref} open anchor={{ x: 100, y: 100 }} onClose={() => {}}>
        <p>content</p>
      </AnchoredCard>,
    );
    expect(ref.current).toBe(screen.getByTestId("anchored-card"));
  });

  it("renders nothing when closed", () => {
    render(
      <AnchoredCard open={false} anchor={{ x: 100, y: 100 }} onClose={() => {}}>
        <p>content</p>
      </AnchoredCard>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders nothing when open but anchor is null (nothing to point at yet)", () => {
    render(
      <AnchoredCard open anchor={null} onClose={() => {}}>
        <p>content</p>
      </AnchoredCard>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders its children when open with a real anchor", () => {
    render(
      <AnchoredCard open anchor={{ x: 100, y: 100 }} onClose={() => {}}>
        <p>content</p>
      </AnchoredCard>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("positions itself at the anchor's pixel coordinates", () => {
    render(
      <AnchoredCard open anchor={{ x: 400, y: 300 }} onClose={() => {}}>
        <p>content</p>
      </AnchoredCard>,
    );
    const card = screen.getByTestId("anchored-card");
    expect(card).toHaveStyle({ left: "400px", top: `${300 - 14}px` });
  });

  it("clamps horizontally so the card never renders past the viewport edge", () => {
    render(
      <AnchoredCard open anchor={{ x: 5, y: 300 }} onClose={() => {}}>
        <p>content</p>
      </AnchoredCard>,
    );
    const card = screen.getByTestId("anchored-card");
    // window.innerWidth defaults to 1024 in jsdom; near the LEFT edge the
    // card clamps to half-width + margin, not the raw (too-far-left) anchor.x.
    expect(card).toHaveStyle({ left: "162px" });
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <AnchoredCard open anchor={{ x: 100, y: 100 }} onClose={onClose}>
        <p>content</p>
      </AnchoredCard>,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <AnchoredCard open anchor={{ x: 100, y: 100 }} onClose={onClose}>
        <p>content</p>
      </AnchoredCard>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus to the close button when opened", () => {
    render(
      <AnchoredCard open anchor={{ x: 100, y: 100 }} onClose={() => {}}>
        <p>content</p>
      </AnchoredCard>,
    );
    expect(screen.getByRole("button", { name: /close/i })).toHaveFocus();
  });

  it("restores focus to the trigger that opened it once closed", () => {
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            trigger
          </button>
          <AnchoredCard open={open} anchor={{ x: 100, y: 100 }} onClose={() => setOpen(false)}>
            <p>content</p>
          </AnchoredCard>
        </>
      );
    }
    render(<Wrapper />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(trigger).toHaveFocus();
  });

  it("does not render a backdrop — the map underneath stays interactive, unlike the modal Sheet", () => {
    render(
      <AnchoredCard open anchor={{ x: 100, y: 100 }} onClose={() => {}}>
        <p>content</p>
      </AnchoredCard>,
    );
    expect(screen.queryByTestId("sheet-backdrop")).not.toBeInTheDocument();
  });
});
