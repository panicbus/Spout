import type { Attribution } from "./source.js";
import type { ProbabilityGrid } from "./probability.js";

/**
 * Test-only builders for the schemas in this package. Deliberately its
 * own subpath (`@spout/contracts/fixtures.js`), not re-exported from the
 * main index — nothing outside a test file should import from here.
 *
 * Before this existed, the same ~15-line `ProbabilityGrid` object literal
 * was hand-copied across six test files in `packages/api` and
 * `packages/web`; each was one schema change away from silently drifting
 * out of sync with the real shape. One builder here, imported by all six,
 * means a schema change breaks the build instead of drifting quietly.
 */

export function buildAttribution(overrides: Partial<Attribution> = {}): Attribution {
  return {
    datasetName: "Test Dataset",
    datasetId: "test-dataset",
    publisherName: "Test Publisher",
    publisherId: "test-publisher",
    license: { id: "public-domain", commercialUse: true },
    ...overrides,
  };
}

export function buildProbabilityGrid(overrides: Partial<ProbabilityGrid> = {}): ProbabilityGrid {
  return {
    species: "blue-whale",
    modelDate: "2026-09-15",
    generatedAt: "2026-09-18T10:10:35.000Z",
    bbox: [-134, 30, -115.5, 48],
    rows: 1,
    cols: 1,
    resolutionDegrees: 0.1,
    cells: [{ lat: 34.15, lon: -120.45, probability: 0.97 }],
    attribution: buildAttribution({
      datasetName: "WhaleWatch 2.0 blue whale habitat suitability",
      datasetId: "whalewatch2-blue-whale-ensemble",
      publisherName: "NOAA WhaleWatch 2.0",
      publisherId: "noaa-whalewatch2",
    }),
    ...overrides,
  };
}
