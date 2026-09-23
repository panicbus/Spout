import type { Species } from "@spout/contracts";
import blueWhaleIcon from "../../assets/species/blue-whale.png";
import grayWhaleIcon from "../../assets/species/gray-whale.png";
import humpbackWhaleIcon from "../../assets/species/humpback-whale.png";
import orcaIcon from "../../assets/species/orca.png";

/** Shared between `SeasonalityCard` (one month) and `YearChart` (all twelve) — extracted here rather than duplicated so the two never drift on how a share/month is labeled. */
export const SPECIES_ICONS: Record<Species, string> = {
  "blue-whale": blueWhaleIcon,
  "humpback-whale": humpbackWhaleIcon,
  "gray-whale": grayWhaleIcon,
  orca: orcaIcon,
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatShare(share: number): string {
  if (share === 0) return "not reported";
  if (share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
}
