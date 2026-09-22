import { SeasonalityResponseSchema } from "@spout/contracts";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";

const FAKE_RESULT = {
  month: 9,
  species: [{ species: "humpback-whale" as const, share: 0.86, sampleSize: 100 }],
};

describe("GET /api/seasonality", () => {
  it("returns the computed seasonality for the given lat/lon/date", async () => {
    const app = createApp({ seasonalityFetcher: vi.fn().mockResolvedValue(FAKE_RESULT) });

    const res = await app.request("/api/seasonality?lat=36.6&lon=-121.9&date=2026-09-12");

    expect(res.status).toBe(200);
    const body = SeasonalityResponseSchema.parse(await res.json());
    expect(body.month).toBe(9);
  });

  it("rejects a request missing required query params with 400", async () => {
    const app = createApp({ seasonalityFetcher: vi.fn().mockResolvedValue(FAKE_RESULT) });

    const res = await app.request("/api/seasonality?lat=36.6");

    expect(res.status).toBe(400);
  });

  it("returns 503 and logs when the upstream fetch fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({ seasonalityFetcher: vi.fn().mockRejectedValue(new Error("GBIF is down")) });

    const res = await app.request("/api/seasonality?lat=36.6&lon=-121.9&date=2026-09-12");

    expect(res.status).toBe(503);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
