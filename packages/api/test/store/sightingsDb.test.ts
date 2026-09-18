import { buildSighting } from "@spout/contracts/fixtures.js";
import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
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
