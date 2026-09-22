import { describe, expect, it, vi } from "vitest";
import { fetchEcmmDensity } from "../../src/sources/ecmmDensity.js";

// A real point inside ECMM's verified U.S. Atlantic/Gulf coverage (Stellwagen Bank area).
const ATLANTIC_LAT = 42.35;
const ATLANTIC_LON = -70.2;
// A real point nowhere near it (Monterey Bay, CA).
const PACIFIC_LAT = 36.6;
const PACIFIC_LON = -121.9;

function pointResponse(density: number | null) {
  return new Response(
    JSON.stringify({
      table: { rows: [["2014-05-16T00:00:00Z", ATLANTIC_LAT, ATLANTIC_LON, density]] },
    }),
  );
}

describe("fetchEcmmDensity", () => {
  it("returns the modeled density for a species/location the humpback climatology actually covers", async () => {
    const fetchImpl = vi.fn(async () => pointResponse(2.58));

    const result = await fetchEcmmDensity("humpback-whale", ATLANTIC_LAT, ATLANTIC_LON, 5, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBe(2.58);
  });

  it("queries the humpback climatology's month-mapped date, not a fixed one", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL) => pointResponse(1));

    await fetchEcmmDensity("humpback-whale", ATLANTIC_LAT, ATLANTIC_LON, 9, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("2014-09-16T00:00:00Z");
  });

  it("queries blue whale/orca (single-timestep, annual-average models — verified live via each dataset's own .das metadata) with '(last)', ignoring the requested month", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL) => pointResponse(0.5));

    await fetchEcmmDensity("blue-whale", ATLANTIC_LAT, ATLANTIC_LON, 9, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("(last)");
    expect(String(url)).not.toContain("2014-09");
  });

  it("returns undefined without making a network call for gray whale — no Atlantic model exists, not a fetch failure", async () => {
    const fetchImpl = vi.fn(async () => pointResponse(1));

    const result = await fetchEcmmDensity("gray-whale", ATLANTIC_LAT, ATLANTIC_LON, 5, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns undefined without making a network call for a point outside ECMM's Atlantic/Gulf bbox", async () => {
    const fetchImpl = vi.fn(async () => pointResponse(1));

    const result = await fetchEcmmDensity("humpback-whale", PACIFIC_LAT, PACIFIC_LON, 5, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns undefined (not a crash) for a valid grid cell with no estimate, e.g. land", async () => {
    const fetchImpl = vi.fn(async () => pointResponse(null));

    const result = await fetchEcmmDensity("humpback-whale", ATLANTIC_LAT, ATLANTIC_LON, 5, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined, not an error, when the upstream 404s (e.g. a grid edge case)", async () => {
    const fetchImpl = vi.fn(async () => new Response("not found", { status: 404 }));

    const result = await fetchEcmmDensity("humpback-whale", ATLANTIC_LAT, ATLANTIC_LON, 5, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBeUndefined();
  });

  it("never throws — an unexpected upstream failure is swallowed and logged, since this is enrichment, not core data", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new Error("network reset");
    });

    const result = await fetchEcmmDensity("humpback-whale", ATLANTIC_LAT, ATLANTIC_LON, 5, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffDelayMs: () => 0, // no real waiting through fetchWithBackoff's retries
    });

    expect(result).toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
