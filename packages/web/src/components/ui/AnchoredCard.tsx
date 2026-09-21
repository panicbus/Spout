import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import styles from "./AnchoredCard.module.css";

export interface AnchoredCardProps {
  open: boolean;
  /** Screen-space pixel position (e.g. from `useProjectedPoint`) this card points at. `null` while nothing is anchored. */
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Half of `.card`'s CSS `max-width` — kept in sync with `AnchoredCard.module.css` for the horizontal clamp below. */
const CARD_HALF_WIDTH = 150;
const VIEWPORT_MARGIN = 12;
const GAP_ABOVE_ANCHOR = 14;

/**
 * A small card that stays visually pinned to a map feature (via `anchor`,
 * a live-updating screen position — see `useProjectedPoint`), connected
 * to it with a downward-pointing arrow, the way `SightingsLayer`'s tapped
 * pin shows its detail. Distinct from `Sheet`: no backdrop and no focus
 * trap, because this isn't a modal — the map underneath stays fully
 * interactive (panning, tapping another pin) while this is open, matching
 * how a real map annotation popup behaves. `SightingsLayer` itself is
 * what actually dismisses this on an elsewhere-click (see its own click
 * handler); this component only owns Escape-to-close.
 *
 * Horizontal position is clamped to the viewport so the card doesn't
 * render partly off-screen near a map edge — clamped as one rigid unit
 * with its arrow, so very close to an edge the arrow no longer points
 * exactly at the pin. A per-pixel arrow-offset correction would fix that
 * but isn't worth the complexity for how rarely a real tap lands within
 * ~150px of the viewport edge.
 */
export function AnchoredCard({ open, anchor, onClose, title, children }: AnchoredCardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open || !anchor) return null;

  const left = Math.min(
    Math.max(anchor.x, CARD_HALF_WIDTH + VIEWPORT_MARGIN),
    window.innerWidth - CARD_HALF_WIDTH - VIEWPORT_MARGIN,
  );
  const top = Math.max(anchor.y - GAP_ABOVE_ANCHOR, VIEWPORT_MARGIN);

  return (
    <div className={styles.card} style={{ left, top }} role="dialog" aria-label={title} data-testid="anchored-card">
      <button type="button" ref={closeButtonRef} className={styles.closeButton} onClick={onClose} aria-label="Close">
        ×
      </button>
      {children}
      <div className={styles.arrow} />
    </div>
  );
}
