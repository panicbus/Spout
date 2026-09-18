import styles from "./Badge.module.css";

export type BadgeTone = "ok" | "warning" | "error" | "neutral";

export interface BadgeProps {
  tone: BadgeTone;
  label: string;
}

/**
 * The one small-pill-with-a-dot component. First used for the API
 * connectivity indicator (R0); reused later for source-tier badges
 * (research/citizen/acoustic) on sighting detail cards (R2-R4) instead of
 * each feature growing its own pill styling.
 */
export function Badge({ tone, label }: BadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
