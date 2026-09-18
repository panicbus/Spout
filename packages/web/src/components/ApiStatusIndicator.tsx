import { Badge, type BadgeTone } from "./ui/Badge.js";
import styles from "./ApiStatusIndicator.module.css";
import { useApiHealth } from "../lib/useApiHealth.js";

const PRESENTATION: Record<"checking" | "ok" | "unreachable", { tone: BadgeTone; label: string }> = {
  checking: { tone: "neutral", label: "Checking API…" },
  ok: { tone: "ok", label: "API connected" },
  unreachable: { tone: "error", label: "API unreachable" },
};

/**
 * A small corner indicator, not a status page — its job is to make an
 * offline/misconfigured API visible instead of a map that silently never
 * gets its data layers (relevant once `features/*` start fetching
 * through this same API). Composes `useApiHealth` + the shared `Badge`
 * primitive rather than owning any fetch or styling logic itself.
 */
export function ApiStatusIndicator() {
  const health = useApiHealth();
  const { tone, label } = PRESENTATION[health.state];

  return (
    <div className={styles.wrapper}>
      <Badge tone={tone} label={label} />
    </div>
  );
}
