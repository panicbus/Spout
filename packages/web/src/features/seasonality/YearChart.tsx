import { SPECIES_LABELS, type SeasonalityYearResponse } from "@spout/contracts";
import { MONTH_NAMES, SPECIES_ICONS, formatShare } from "./seasonalityDisplay.js";
import styles from "./YearChart.module.css";

const MONTH_INITIALS = MONTH_NAMES.map((name) => name[0]);

/** A floor so a real, nonzero-but-tiny share still renders as a visible sliver rather than a bar indistinguishable from 0. */
const MIN_BAR_HEIGHT_PERCENT = 4;

export interface YearChartProps {
  data: SeasonalityYearResponse;
  /** 1-12 — highlighted in the month-label row and on each species' matching bar, so the single-month view above stays visually anchored to the expanded year view below it. */
  currentMonth: number;
}

/**
 * A 12-bar-per-species sparkline — "what does this whole spot's
 * calendar look like," not just the tapped date's one month. Hand-rolled
 * divs, not a charting library: this is exactly the kind of small,
 * fixed-shape visual (12 known bars, no axes/zoom/tooltip-on-hover
 * beyond a plain `title`) the project has consistently preferred to
 * build directly rather than add a dependency for (see the probability
 * raster's own hand-built canvas work).
 */
export function YearChart({ data, currentMonth }: YearChartProps) {
  return (
    <div className={styles.chart}>
      <div className={styles.monthLabels} aria-hidden="true">
        {MONTH_INITIALS.map((initial, i) => (
          <span key={i} className={i + 1 === currentMonth ? styles.currentMonthLabel : undefined}>
            {initial}
          </span>
        ))}
      </div>
      {data.species.map((sp) => (
        <div key={sp.species} className={styles.speciesRow}>
          <img className={styles.speciesIcon} src={SPECIES_ICONS[sp.species]} alt="" />
          <span className={styles.speciesLabel}>{SPECIES_LABELS[sp.species]}</span>
          <div className={styles.bars}>
            {sp.months.map((m) => (
              <div
                key={m.month}
                className={[
                  styles.bar,
                  m.share === undefined ? styles.barEmpty : "",
                  m.month === currentMonth ? styles.barCurrent : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={m.share !== undefined ? { height: `${Math.max(m.share * 100, MIN_BAR_HEIGHT_PERCENT)}%` } : undefined}
                title={`${MONTH_NAMES[m.month - 1]}: ${m.share !== undefined ? formatShare(m.share) : "not enough data"}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
