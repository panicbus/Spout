import { buildAttribution, buildSighting } from "@spout/contracts/fixtures.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import RawDatabase from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  hasGbifSightings,
  hasSightings,
  openSightingsDb,
  querySightings,
  upsertSightings,
} from "../../src/store/sightingsDb.js";

describe("sightingsDb", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openSightingsDb(":memory:");
  });

  it("round-trips a sighting through upsert + query exactly", () => {
    const sighting = buildSighting();
    upsertSightings(db, [sighting]);

    const [result] = querySightings(db, {});

    expect(result).toEqual(sighting);
  });

  it("round-trips photoUrl when present, and back to undefined (not null) when absent", () => {
    upsertSightings(db, [buildSighting({ id: "a", photoUrl: "https://example.com/photo.jpg" })]);
    upsertSightings(db, [buildSighting({ id: "b", photoUrl: undefined })]);

    const results = querySightings(db, {});
    expect(results.find((s) => s.id === "a")?.photoUrl).toBe("https://example.com/photo.jpg");
    expect(results.find((s) => s.id === "b")?.photoUrl).toBeUndefined();
  });

  it("round-trips happywhaleUrl when present, and back to undefined (not null) when absent", () => {
    upsertSightings(db, [buildSighting({ id: "a", happywhaleUrl: "https://happywhale.com/encounter/623491" })]);
    upsertSightings(db, [buildSighting({ id: "b", happywhaleUrl: undefined })]);

    const results = querySightings(db, {});
    expect(results.find((s) => s.id === "a")?.happywhaleUrl).toBe("https://happywhale.com/encounter/623491");
    expect(results.find((s) => s.id === "b")?.happywhaleUrl).toBeUndefined();
  });

  it("replaces a sighting with the same id instead of duplicating it — refresh must not accumulate stale copies", () => {
    upsertSightings(db, [buildSighting({ lat: 36.5 })]);
    upsertSightings(db, [buildSighting({ lat: 37.0 })]);

    const results = querySightings(db, {});

    expect(results).toHaveLength(1);
    expect(results[0]?.lat).toBe(37.0);
  });

  it("filters by bbox", () => {
    upsertSightings(db, [
      buildSighting({ id: "a", lat: 36.5, lon: -122.1 }), // inside
      buildSighting({ id: "b", lat: 45.0, lon: -122.1 }), // outside (too far north)
    ]);

    const results = querySightings(db, { bbox: [-126, 32, -117, 42] });

    expect(results.map((s) => s.id)).toEqual(["a"]);
  });

  it("filters by species", () => {
    upsertSightings(db, [
      buildSighting({ id: "a", species: "humpback-whale" }),
      buildSighting({ id: "b", species: "orca" }),
    ]);

    const results = querySightings(db, { species: ["orca"] });

    expect(results.map((s) => s.id)).toEqual(["b"]);
  });

  it("filters by tier", () => {
    upsertSightings(db, [
      buildSighting({ id: "a", tier: "research" }),
      buildSighting({ id: "b", tier: "citizen" }),
    ]);

    const results = querySightings(db, { tier: ["citizen"] });

    expect(results.map((s) => s.id)).toEqual(["b"]);
  });

  it("filters by sinceDate on observedAt", () => {
    upsertSightings(db, [
      buildSighting({ id: "old", observedAt: "2025-01-01T00:00:00.000Z" }),
      buildSighting({ id: "new", observedAt: "2026-09-01T00:00:00.000Z" }),
    ]);

    const results = querySightings(db, { sinceDate: "2026-01-01" });

    expect(results.map((s) => s.id)).toEqual(["new"]);
  });

  it("filters by commercialOnly", () => {
    upsertSightings(db, [
      buildSighting({
        id: "free",
        attribution: {
          ...buildSighting().attribution,
          license: { id: "CC0_1_0", commercialUse: true },
        },
      }),
      buildSighting({
        id: "nc",
        attribution: {
          ...buildSighting().attribution,
          license: { id: "CC_BY_NC_4_0", commercialUse: false },
        },
      }),
    ]);

    const results = querySightings(db, { commercialOnly: true });

    expect(results.map((s) => s.id)).toEqual(["free"]);
  });

  it("combines multiple filters", () => {
    upsertSightings(db, [
      buildSighting({ id: "match", species: "orca", tier: "research" }),
      buildSighting({ id: "wrong-species", species: "gray-whale", tier: "research" }),
      buildSighting({ id: "wrong-tier", species: "orca", tier: "citizen" }),
    ]);

    const results = querySightings(db, { species: ["orca"], tier: ["research"] });

    expect(results.map((s) => s.id)).toEqual(["match"]);
  });

  it("caps results at a hard limit, so an unbounded window can't serialize the entire table into one response", () => {
    const many = Array.from({ length: 20 }, (_, i) => buildSighting({ id: `s${i}` }));
    upsertSightings(db, many);

    const results = querySightings(db, { limit: 5 });

    expect(results).toHaveLength(5);
  });
});

describe("openSightingsDb migration", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spout-sightings-migration-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("adds photo_url to a real on-disk database created before that column existed, without losing existing rows", () => {
    const path = join(dir, "sightings.db");

    // Simulate a pre-photoUrl deploy: the table exists, but predates the
    // ALTER TABLE this migration adds — CREATE TABLE IF NOT EXISTS alone
    // would never add a missing column to an already-existing table.
    const legacy = new RawDatabase(path);
    legacy.exec(`
      CREATE TABLE sightings (
        id TEXT PRIMARY KEY, species TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
        observed_at TEXT NOT NULL, tier TEXT NOT NULL, source_api TEXT NOT NULL,
        verification TEXT NOT NULL, coordinates_obscured INTEGER NOT NULL,
        positional_uncertainty_m REAL, dataset_name TEXT NOT NULL, dataset_id TEXT NOT NULL,
        publisher_name TEXT NOT NULL, publisher_id TEXT NOT NULL, citation TEXT,
        attribution_url TEXT, license_id TEXT NOT NULL, license_url TEXT,
        license_commercial_use INTEGER NOT NULL
      );
    `);
    legacy
      .prepare(
        `INSERT INTO sightings (id, species, lat, lon, observed_at, tier, source_api, verification, coordinates_obscured, dataset_name, dataset_id, publisher_name, publisher_id, license_id, license_commercial_use)
         VALUES ('pre-existing', 'orca', 36.5, -122.1, '2026-09-01T00:00:00.000Z', 'research', 'gbif', 'verified', 0, 'Test Dataset', 'test-dataset', 'Test Publisher', 'test-publisher', 'public-domain', 1)`,
      )
      .run();
    legacy.close();

    const db = openSightingsDb(path);
    const columns = db.prepare("PRAGMA table_info(sightings)").all() as { name: string }[];
    expect(columns.some((c) => c.name === "photo_url")).toBe(true);
    // Same legacy table also predates happywhale_url — one real on-disk
    // database can lag behind multiple migrations at once, and this
    // proves both apply, not just whichever one a narrower fixture happened to cover.
    expect(columns.some((c) => c.name === "happywhale_url")).toBe(true);

    const [preExisting] = querySightings(db, {});
    expect(preExisting).toMatchObject({ id: "pre-existing", photoUrl: undefined, happywhaleUrl: undefined });

    upsertSightings(db, [buildSighting({ id: "new", photoUrl: "https://example.com/p.jpg" })]);
    expect(querySightings(db, {}).find((s) => s.id === "new")?.photoUrl).toBe("https://example.com/p.jpg");
  });
});

describe("hasSightings", () => {
  it("returns false for an empty store", () => {
    const db = openSightingsDb(":memory:");
    expect(hasSightings(db)).toBe(false);
  });

  it("returns true once at least one row exists", () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [buildSighting()]);
    expect(hasSightings(db)).toBe(true);
  });
});

describe("hasGbifSightings", () => {
  it("returns false for an empty store", () => {
    const db = openSightingsDb(":memory:");
    expect(hasGbifSightings(db)).toBe(false);
  });

  it("returns true once a GBIF-origin row exists", () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [buildSighting()]); // default fixture attribution.datasetId is GBIF-shaped, not "inaturalist-api-direct"
    expect(hasGbifSightings(db)).toBe(true);
  });

  it("returns false when the store only has rows from iNaturalist's direct API, even though hasSightings would return true — the R3 bug this exists to prevent: a fast iNaturalist-direct refresh landing first on a fresh deploy must not make GBIF's cold-start check think it has already backfilled", () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [
      buildSighting({ attribution: buildAttribution({ datasetId: "inaturalist-api-direct" }) }),
    ]);

    expect(hasSightings(db)).toBe(true);
    expect(hasGbifSightings(db)).toBe(false);
  });

  it("returns true for a GBIF-origin row even after R3's de-dup convergence remaps it to sourceApi \"inaturalist\" — dataset_id, not source_api, is what distinguishes true origin", () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [
      buildSighting({
        id: "inaturalist:1",
        sourceApi: "inaturalist", // converged id/sourceApi (see normalize/sighting.ts), but still GBIF-origin data
        attribution: buildAttribution({ datasetId: "50c9509d-22c7-4a22-a47d-8c48425ef4a7" }),
      }),
    ]);

    expect(hasGbifSightings(db)).toBe(true);
  });
});
