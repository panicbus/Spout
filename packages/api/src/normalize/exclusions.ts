/**
 * `datasetKey`s excluded from Spout entirely — not merely re-tiered.
 * SanctSound is 12,504+ machine-generated hydrophone presence/absence
 * rows concentrated on ~8 fixed buoy coordinates; rendered as sighting
 * pins (or fed into any density calculation) they read as false hotspots
 * at the buoy locations, not real whale presence (verified and decided
 * in ADR 0002).
 */
const EXCLUDED_DATASET_KEYS = new Set(["b3fc1d76-a50d-4a57-a2f3-425adfc59f9f"]);

export function isExcludedDataset(datasetKey: string): boolean {
  return EXCLUDED_DATASET_KEYS.has(datasetKey);
}
