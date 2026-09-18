import type { ReactNode } from "react";
import styles from "./Stamp.module.css";

export interface StampProps {
  children: ReactNode;
}

/**
 * A small, unobtrusive overlay caption — first used for the probability
 * layer's "model date" label (R1), and for sighting/report recency
 * ("most recent report: N days ago") in R4. Distinct from `Badge`: a
 * Stamp is a plain caption over the map, not a status pill with a tone.
 */
export function Stamp({ children }: StampProps) {
  return <div className={styles.stamp}>{children}</div>;
}
