import type { SourceTier } from "@spout/contracts";

/**
 * Tiers by *publishing organization*, per ADR 0002 — never by which API
 * answered a query and never by `basisOfRecord` (SanctSound's records are
 * `MACHINE_OBSERVATION` but come from a legitimate NOAA-affiliated
 * acoustic monitoring network, not noise; a Cascadia research record and
 * an iNaturalist snapshot can both be `HumanObservation`).
 *
 * A deliberate **allowlist**, not a heuristic: a publisher not listed
 * here returns `undefined` and its records are dropped during
 * normalization, not guessed at. The long tail of minor GBIF publishers
 * in this bbox (museums, small research orgs — 0.23% of records live-
 * verified during R2's review, consistent with the original "under 1%"
 * estimate) is a smaller cost than mis-tiering a record's trust level.
 * Expand this list deliberately if a real coverage gap shows up.
 *
 * Known visibility gap, not yet closed: that drop is currently silent —
 * nothing counts or logs how many records fall through this allowlist,
 * so if an unlisted publisher's share grows over time (GBIF's publisher
 * mix isn't static), nothing surfaces it short of re-running the same
 * manual GBIF facet query that produced the number above. Worth adding a
 * per-refresh drop counter (e.g. on `SightingsRefreshResult`) before a
 * second or third publisher gets added to this list under less scrutiny
 * than the first three.
 */
const PUBLISHERS: Record<string, { tier: SourceTier; publisherName: string }> = {
  "67b2263f-6990-4d9d-b32b-20aa72ef4fbc": { tier: "research", publisherName: "OBIS-SEAMAP" },
  "28eb1a3f-1c15-4a95-931a-4af90ecb574d": { tier: "citizen", publisherName: "iNaturalist.org" },
  "1d38bb22-cbea-4845-8b0c-f62551076080": {
    tier: "acoustic",
    publisherName: "NOAA Integrated Ocean Observing System",
  },
};

export function tierForPublisher(
  publishingOrgKey: string,
): { tier: SourceTier; publisherName: string } | undefined {
  return PUBLISHERS[publishingOrgKey];
}
