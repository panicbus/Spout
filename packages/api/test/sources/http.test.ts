import { describe, expect, it, vi } from "vitest";
import { fetchWithBackoff } from "../../src/sources/http.js";

function jsonResponse(status: number, headers: Record<string, string> = {}) {
  return new Response("{}", { status, headers });
}

describe("fetchWithBackoff", () => {
  it("returns the response immediately on a 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200));

    const res = await fetchWithBackoff("https://example.com", { fetchImpl });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("retries on 429 and eventually succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));

    const res = await fetchWithBackoff("https://example.com", {
      fetchImpl,
      delayMs: () => 0, // no real waiting in tests
    });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx that isn't 429 — a genuine bad request retrying wastes calls for nothing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400));

    const res = await fetchWithBackoff("https://example.com", { fetchImpl, delayMs: () => 0 });

    expect(res.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("gives up after maxRetries and returns the last (failing) response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429));

    const res = await fetchWithBackoff("https://example.com", {
      fetchImpl,
      delayMs: () => 0,
      maxRetries: 2,
    });

    expect(res.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("waits for the delay the caller's delayMs function returns, doubling by attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(429))
      .mockResolvedValueOnce(jsonResponse(200));
    const delayMs = vi.fn(() => 0);

    await fetchWithBackoff("https://example.com", { fetchImpl, delayMs });

    expect(delayMs).toHaveBeenNthCalledWith(1, 1, undefined);
    expect(delayMs).toHaveBeenNthCalledWith(2, 2, undefined);
  });

  it("passes the response's Retry-After header (seconds) through to delayMs", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { "Retry-After": "2" }))
      .mockResolvedValueOnce(jsonResponse(200));
    const delayMs = vi.fn(() => 0);

    await fetchWithBackoff("https://example.com", { fetchImpl, delayMs });

    expect(delayMs).toHaveBeenNthCalledWith(1, 1, 2);
  });

  it("treats a non-numeric Retry-After (e.g. an HTTP-date, which RFC 9110 also permits) as absent rather than NaN — NaN would make setTimeout fire immediately, the opposite of backing off", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" }))
      .mockResolvedValueOnce(jsonResponse(200));
    const delayMs = vi.fn(() => 0);

    await fetchWithBackoff("https://example.com", { fetchImpl, delayMs });

    expect(delayMs).toHaveBeenNthCalledWith(1, 1, undefined);
  });

  it("retries a rejected fetch (network error) the same as a retryable status, instead of throwing immediately with zero retries", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(200));

    const res = await fetchWithBackoff("https://example.com", { fetchImpl, delayMs: () => 0 });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rethrows the last network error after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      fetchWithBackoff("https://example.com", { fetchImpl, delayMs: () => 0, maxRetries: 2 }),
    ).rejects.toThrow("fetch failed");
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
