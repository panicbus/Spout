import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, fetchHealth } from "./apiClient.js";

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
