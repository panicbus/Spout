import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet.js";

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    render(
      <Sheet open={false} onClose={() => {}}>
        <p>content</p>
      </Sheet>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders its children when open", () => {
    render(
      <Sheet open onClose={() => {}}>
        <p>content</p>
      </Sheet>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("renders the title when given", () => {
    render(
      <Sheet open onClose={() => {}} title="Data sources">
        <p>content</p>
      </Sheet>,
    );
    expect(screen.getByText("Data sources")).toBeInTheDocument();
  });

  it("is an accessible dialog", () => {
    render(
      <Sheet open onClose={() => {}} title="Data sources">
        <p>content</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        <p>content</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose when the sheet's own content is clicked", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        <p>content</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByText("content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        <p>content</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        <p>content</p>
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus to the close button when opened", () => {
    render(
      <Sheet open onClose={() => {}}>
        <p>content</p>
      </Sheet>,
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
          <Sheet open={open} onClose={() => setOpen(false)}>
            <p>content</p>
          </Sheet>
        </>
      );
    }
    render(<Wrapper />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    // `fireEvent.click` (unlike a real browser click, or `userEvent.click`)
    // doesn't itself move focus — focus the trigger explicitly first to
    // simulate what a real click on it would leave focused.
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab focus within the sheet (Tab from the last focusable element wraps to the first)", () => {
    render(
      <Sheet open onClose={() => {}}>
        <button type="button">inner action</button>
      </Sheet>,
    );
    const closeButton = screen.getByRole("button", { name: /close/i });
    const innerAction = screen.getByRole("button", { name: "inner action" });

    innerAction.focus();
    fireEvent.keyDown(innerAction, { key: "Tab" });
    expect(closeButton).toHaveFocus();
  });
});
