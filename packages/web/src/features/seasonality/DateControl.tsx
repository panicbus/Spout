import styles from "./DateControl.module.css";

export interface DateControlProps {
  /** YYYY-MM-DD */
  value: string;
  onChange: (date: string) => void;
}

/**
 * Which date the seasonality feature (tap-the-map, see `SeasonalityCard`)
 * answers "will I see a whale here" for — a plain native date input, not
 * a custom picker: it's free accessibility/keyboard/mobile-native
 * behavior this app doesn't have to build or maintain itself, and this
 * control's whole job is picking one date, nothing more.
 */
export function DateControl({ value, onChange }: DateControlProps) {
  return (
    <label className={styles.control}>
      <span className={styles.label}>Check sightings for</span>
      <input
        type="date"
        className={styles.input}
        value={value}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      />
    </label>
  );
}
