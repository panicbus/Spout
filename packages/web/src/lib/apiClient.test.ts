import { afterEach, describe, expect, it, vi } from "vitest";
import { ProbabilityGridSchema } from "@spout/contracts";
import { buildProbabilityGrid, buildSighting } from "@spout/contracts/fixtures.js";
import { API_BASE_URL, fetchHealth, fetchProbabilityGrid, fetchSightings } from "./apiClient.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /health from the given base URL and returns the parsed body", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: "ok", timestamp: "2026-09-18T00:00:00.000Z" }));
    vi.stubGlobal("fetch", mockFetch);

    const health = await fetchHealth("http://localhost:8787");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8787/health");
    expect(health).toEqual({ status: "ok", timestamp: "2026-09-18T00:00:00.000Z" });
  });

  it("defaults to API_BASE_URL when no base URL is given", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ status: "ok", timestamp: "x" }));
    vi.stubGlobal("fetch", mockFetch);

    await fetchHealth();

    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE_URL}/health`);
  });

  it("rejects when the response body fails HealthStatusSchema validation — a malformed API must not be trusted silently", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: "degraded" })));
    await expect(fetchHealth("http://localhost:8787")).rejects.toThrow();
  });

  it("rejects when the HTTP response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(fetchHealth("http://localhost:8787")).rejects.toThrow();
  });
});

describe("fetchProbabilityGrid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /api/probability and returns a schema-valid grid", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse(buildProbabilityGrid()));
    vi.stubGlobal("fetch", mockFetch);

    const grid = await fetchProbabilityGrid("http://localhost:8787");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8787/api/probability");
    expect(ProbabilityGridSchema.parse(grid).modelDate).toBe("2026-09-15");
  });

  // Non-ok-status and schema-validation rejection are shared
  // `fetchAndValidate` behavior, already proven once in fetchHealth's
  // tests above — every fetch* function routes through the same helper.
});

describe("fetchSightings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /api/sightings with no query string when no params are given", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse([buildSighting()]));
    vi.stubGlobal("fetch", mockFetch);

    const sightings = await fetchSightings({}, "http://localhost:8787");

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8787/api/sightings");
    expect(sightings).toHaveLength(1);
  });

  it("includes params in the query string", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    await fetchSightings({ species: ["orca"], window: "12m" }, "http://localhost:8787");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/api/sightings?species=orca&window=12m",
    );
  });
});
