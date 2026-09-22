import { describe, expect, it, vi } from "vitest";
import type { Sighting } from "@spout/contracts";
import { buildSighting } from "@spout/contracts/fixtures.js";
import { GlobalSightingsCache, isWithinCaCoastBbox } from "../../src/store/globalSightingsCache.js";

describe("isWithinCaCoastBbox", () => {
  it("is true for a bbox fully inside CA_COAST_BBOX", () => {
    expect(isWithinCaCoastBbox([-122.5, 36, -121.5, 37])).toBe(true);
  });

  it("is false for a bbox that extends outside CA_COAST_BBOX", () => {
    expect(isWithinCaCoastBbox([-122.5, 36, -100, 37])).toBe(false);
  });

  it("is false for a bbox entirely elsewhere (Sydney Harbour)", () => {
    expect(isWithinCaCoastBbox([150, -34, 152, -33])).toBe(false);
  });

  it("is true for CA_COAST_BBOX itself (boundary-inclusive)", () => {
    expect(isWithinCaCoastBbox([-126, 32, -117, 42])).toBe(true);
  });
});

describe("GlobalSightingsCache", () => {
  it("fetches sightings for the given bbox via the injected fetcher", async () => {
    const sighting = buildSighting({ id: "gbif:1" });
    const fetcher = vi.fn().mockResolvedValue([sighting]);
    const cache = new GlobalSightingsCache(fetcher);

    const result = await cache.get([150, -34, 152, -33], "30d");

    expect(result).toEqual([sighting]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ bbox: [150, -34, 152, -33] }),
    );
  });

  it("does not refetch the same bbox+window within the TTL window", async () => {
    const fetcher = vi.fn().mockResolvedValue([] as Sighting[]);
    const cache = new GlobalSightingsCache(fetcher);

    await cache.get([150, -34, 152, -33], "30d");
    await cache.get([150, -34, 152, -33], "30d");

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("treats a different window for the same bbox as a separate cache entry", async () => {
    const fetcher = vi.fn().mockResolvedValue([] as Sighting[]);
    const cache = new GlobalSightingsCache(fetcher);

    await cache.get([150, -34, 152, -33], "30d");
    await cache.get([150, -34, 152, -33], "12m");

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
