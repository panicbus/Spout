import { ProbabilityGridSchema } from "@spout/contracts";
import { buildProbabilityGrid } from "@spout/contracts/fixtures.js";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";

describe("GET /api/probability", () => {
  it("returns the fetched grid as JSON", async () => {
    const app = createApp({
      probabilityFetcher: vi.fn().mockResolvedValue(buildProbabilityGrid({ modelDate: "2026-09-15" })),
    });

    const res = await app.request("/api/probability");

    expect(res.status).toBe(200);
    const body = ProbabilityGridSchema.parse(await res.json());
    expect(body.modelDate).toBe("2026-09-15");
    expect(body.cells).toHaveLength(1);
  });

  it("returns 503 when the source has never successfully fetched", async () => {
    const app = createApp({
      probabilityFetcher: vi.fn().mockRejectedValue(new Error("NOAA is down")),
    });

    const res = await app.request("/api/probability");

    expect(res.status).toBe(503);
  });

  it("logs the real error instead of swallowing it — a decode/schema bug must leave a diagnostic trail, not just a generic 503", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("WhaleWatch2 raster fetch failed for 2026-09-15");
    const app = createApp({ probabilityFetcher: vi.fn().mockRejectedValue(error) });

    await app.request("/api/probability");

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("/api/probability"), error);
    consoleError.mockRestore();
  });
});
