import type { ReactNode } from "react";
import styles from "./Chip.module.css";

export interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

/**
 * A single selectable pill — first used by `FilterBar`'s time-window
 * picker (R4), the standard shape for any future single/multi-select
 * option row (species, tier) rather than each growing its own button
 * styling. `aria-pressed` (not a visually-hidden "selected" label) is the
 * one source of selected state, for assistive tech and tests alike.
 */
export function Chip({ selected, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      data-selected={selected}
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
