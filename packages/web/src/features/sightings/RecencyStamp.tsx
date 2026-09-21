import { Stamp } from "../../components/ui/Stamp.js";
import { ageInDays } from "../../lib/ageBucket.js";
import { formatDaysAgo, mostRecentObservedAt } from "../../lib/recency.js";
import { useNow } from "../../lib/useNow.js";
import { useSightings } from "../../lib/useSightings.js";
import styles from "./RecencyStamp.module.css";

export interface RecencyStampProps {
  now?: Date;
}

/**
 * ADR 0003's "most recent report: N days ago" honesty stamp. Deliberately
 * runs its own independent `window: "latest"` (7-day) fetch rather than
 * reading whatever window `FilterBar`/`SightingsLayer` currently has
 * selected: the whole point is to always reveal real pipeline freshness,
 * even when the user has a different (possibly empty, possibly stale)
 * window selected — a thin result set should read as an honest reflection
 * of the data, not a broken app.
 *
 * Known, deliberately accepted trade-offs (not silently dropped):
 * - When the user has "Latest reports" selected, this and `SightingsLayer`
 *   both independently fetch `window: "latest"` with no shared client-side
 *   cache — two HTTP round trips instead of one. Verified acceptable: the
 *   API's `TtlCache` (`packages/api/src/store/ttlCache.ts`) already
 *   de-duplicates concurrent in-flight upstream refreshes, so this never
 *   doubles the real GBIF/iNaturalist cost — just two cheap local SQLite
 *   reads. Revisit only if a real shared sightings cache is built for
 *   other reasons.
 * - The displayed "N days ago" recomputes on a 5-minute timer (`useNow`),
 *   not just on a refetch — a tab left open across a day boundary no
 *   longer shows an increasingly stale count indefinitely. `now` stays
 *   overridable via props (tests pass a fixed value and never see the
 *   ticking one) rather than always reading the live clock internally.
 */
export function RecencyStamp({ now }: RecencyStampProps) {
  const liveNow = useNow();
  const effectiveNow = now ?? liveNow;
  const result = useSightings({ window: "latest" });

  if (result.state !== "ok") return null;

  const latest = mostRecentObservedAt(result.data);
  const message =
    latest === null
      ? "No reports in the last 7 days"
      : `Most recent report: ${formatDaysAgo(ageInDays(latest, effectiveNow))}`;

  return (
    <div className={styles.wrapper}>
      <Stamp>{message}</Stamp>
    </div>
  );
}
