import { TIME_WINDOWS, type TimeWindow } from "@spout/contracts";
import { Chip } from "../../components/ui/Chip.js";
import styles from "./FilterBar.module.css";

/**
 * `"latest"`'s label is "Latest reports," not "Today" — ADR 0003's
 * decision, kept here as the one place a `TimeWindow` becomes UI copy.
 */
const WINDOW_LABELS: Record<TimeWindow, string> = {
  latest: "Latest reports",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

export interface FilterBarProps {
  value: TimeWindow;
  onChange: (timeWindow: TimeWindow) => void;
}

/**
 * Controlled time-window picker — a row of `Chip`s over `TIME_WINDOWS`
 * (`@spout/contracts`). Owns no state itself: `App.tsx` holds `value` and
 * passes it to both this and `SightingsLayer`, so the two agree by
 * construction. `RecencyStamp` deliberately does NOT receive it — it
 * always fetches its own fixed 7-day `"latest"` window regardless of
 * what's selected here, so the honesty stamp stays accurate even when
 * this filter is set to something else entirely (see its own doc
 * comment for why, per ADR 0003).
 */
export function FilterBar({ value, onChange }: FilterBarProps) {
  return (
    <div className={styles.bar} role="group" aria-label="Time window">
      {TIME_WINDOWS.map((timeWindow) => (
        <Chip key={timeWindow} selected={timeWindow === value} onClick={() => onChange(timeWindow)}>
          {WINDOW_LABELS[timeWindow]}
        </Chip>
      ))}
    </div>
  );
}
