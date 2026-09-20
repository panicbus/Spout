import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import styles from "./Sheet.module.css";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The one bottom-sheet/modal-overlay primitive — first used by
 * `PinDetailCard` and `DataCreditsPanel` (R4b), reused rather than each
 * growing its own backdrop-and-dismiss logic. Dismissible by tapping the
 * backdrop, the close button, or pressing Escape; a click on the sheet's
 * own content is stopped from bubbling to the backdrop so tapping inside
 * the card never accidentally closes it.
 *
 * Keyboard behavior: focus moves to the close button on open and is
 * trapped within the sheet (Tab/Shift+Tab wrap at its ends) so a
 * keyboard user can never tab into the backdrop-covered content behind
 * it, and returns to whatever was focused before the sheet opened once
 * it closes.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;

      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} data-testid="sheet-backdrop">
      <div
        ref={sheetRef}
        className={styles.sheet}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button type="button" ref={closeButtonRef} className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
        {title && <h2 className={styles.title}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
