import { SightingSchema } from "@spout/contracts";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/app.js";
import { openSightingsDb, upsertSightings } from "../../src/store/sightingsDb.js";

const SightingsListSchema = z.array(SightingSchema);

describe("GET /api/sightings", () => {
  it("returns sightings from the store as JSON, after ensuring a refresh has run", async () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [buildSighting({ observedAt: new Date().toISOString() })]);
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]), // no new data; the pre-seeded row is what we're testing against
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings");

    expect(res.status).toBe(200);
    const body = SightingsListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe("gbif:1");
  });

  it("filters by species via a comma-separated query param", async () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [
      buildSighting({ id: "a", species: "orca" }),
      buildSighting({ id: "b", species: "gray-whale" }),
    ]);
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings?species=orca");

    const body = SightingsListSchema.parse(await res.json());
    expect(body.map((s) => s.id)).toEqual(["a"]);
  });

  it("filters by bbox via a comma-separated query param", async () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [
      buildSighting({ id: "inside", lat: 36.5, lon: -122.1 }),
      buildSighting({ id: "outside", lat: 45.0, lon: -122.1 }),
    ]);
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings?bbox=-126,32,-117,42");

    const body = SightingsListSchema.parse(await res.json());
    expect(body.map((s) => s.id)).toEqual(["inside"]);
  });

  it("applies the default 30d window when none is given", async () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [
      buildSighting({ id: "recent", observedAt: new Date().toISOString() }),
      buildSighting({ id: "old", observedAt: "2020-01-01T00:00:00.000Z" }),
    ]);
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings");

    const body = SightingsListSchema.parse(await res.json());
    expect(body.map((s) => s.id)).toEqual(["recent"]);
  });

  it("rejects an invalid query with 400", async () => {
    const db = openSightingsDb(":memory:");
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings?window=not-a-real-window");

    expect(res.status).toBe(400);
  });

  it("rejects a bbox with a trailing comma (empty segment) with 400, rather than silently treating it as 0", async () => {
    const db = openSightingsDb(":memory:");
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings?bbox=-126,32,-117,");

    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric bbox segment with 400", async () => {
    const db = openSightingsDb(":memory:");
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings?bbox=abc,32,-117,42");

    expect(res.status).toBe(400);
  });

  it("rejects an unrecognized commercialOnly value with 400, rather than silently disabling the licensing filter", async () => {
    const db = openSightingsDb(":memory:");
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings?commercialOnly=TRUE");

    expect(res.status).toBe(400);
  });

  it("accepts commercialOnly=false explicitly", async () => {
    const db = openSightingsDb(":memory:");
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings?commercialOnly=false");

    expect(res.status).toBe(200);
  });

  it("returns data from the store even when the refresh fetch fails, rather than 503ing an endpoint with real cached data behind it", async () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [buildSighting()]);
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockRejectedValue(new Error("GBIF is down")),
      inaturalistFetcher: vi.fn().mockResolvedValue([]),
    });

    const res = await app.request("/api/sightings");

    // First-ever refresh failing with nothing cached in the TtlCache's
    // own value would normally throw — but the store already has rows
    // from a previous run (simulated by the pre-seeded upsert above),
    // so the route should still answer from the store.
    expect(res.status).toBe(200);
  });

  it("ensures both the GBIF and iNaturalist refreshes have run before answering", async () => {
    const db = openSightingsDb(":memory:");
    const sightingsFetcher = vi.fn().mockResolvedValue([]);
    const inaturalistFetcher = vi.fn().mockResolvedValue([]);
    const app = createApp({ sightingsDb: db, sightingsFetcher, inaturalistFetcher });

    await app.request("/api/sightings");

    expect(sightingsFetcher).toHaveBeenCalled();
    expect(inaturalistFetcher).toHaveBeenCalled();
  });

  it("runs the GBIF refresh before the iNaturalist refresh, so a converged id's iNaturalist-direct write always lands last and wins the upsert race", async () => {
    // GBIF is made artificially slower than iNaturalist here specifically
    // so this test can tell "sequential" apart from "concurrent": under
    // the old Promise.allSettled-concurrent implementation, iNaturalist's
    // instantly-resolving fetch would complete (and its write would land)
    // BEFORE GBIF's slower one, regardless of array order — only an
    // actually-sequential await guarantees GBIF completes first no matter
    // which fetch is slower.
    const db = openSightingsDb(":memory:");
    const callOrder: string[] = [];
    const sightingsFetcher = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      callOrder.push("gbif");
      return [];
    });
    const inaturalistFetcher = vi.fn().mockImplementation(async () => {
      callOrder.push("inaturalist");
      return [];
    });
    const app = createApp({ sightingsDb: db, sightingsFetcher, inaturalistFetcher });

    await app.request("/api/sightings");

    expect(callOrder).toEqual(["gbif", "inaturalist"]);
  });

  it("still answers from the store if only the iNaturalist refresh fails", async () => {
    const db = openSightingsDb(":memory:");
    upsertSightings(db, [buildSighting()]);
    const app = createApp({
      sightingsDb: db,
      sightingsFetcher: vi.fn().mockResolvedValue([]),
      inaturalistFetcher: vi.fn().mockRejectedValue(new Error("iNaturalist is down")),
    });

    const res = await app.request("/api/sightings");

    expect(res.status).toBe(200);
  });
});
