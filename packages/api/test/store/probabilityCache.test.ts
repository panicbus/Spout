import { describe, expect, it, vi } from "vitest";
import { ProbabilityCache } from "../../src/store/probabilityCache.js";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";

/**
 * `ProbabilityCache` is a thin named specialization of `TtlCache<T>` —
 * see `test/store/ttlCache.test.ts` for the actual TTL/stale/in-flight
 * behavior this inherits. This just confirms the specialization works
 * against a real `ProbabilityGrid` shape.
 */
describe("ProbabilityCache", () => {
  it("caches and returns a ProbabilityGrid", async () => {
    const grid = buildProbabilityGrid({ modelDate: "2026-09-15" });
    const fetcher = vi.fn().mockResolvedValue(grid);
    const cache = new ProbabilityCache({ ttlMs: 1000, fetcher });

    const result = await cache.get();

    expect(result.modelDate).toBe("2026-09-15");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
