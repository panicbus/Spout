import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  MANIFEST_URL,
  fetchLatestProbabilityGrid,
  parseLatestRasterDate,
  rasterUrl,
} from "../../src/sources/whalewatch.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../../../fixtures/whalewatch/", import.meta.url));

function readFixture(name: string) {
  return readFileSync(`${FIXTURES_DIR}${name}`);
}

const manifest = JSON.parse(readFixture("showfiles-sample.json").toString("utf-8"));
const grdText = readFixture("blwh_ensemble_2026-09-15.grd").toString("utf-8");
const griBuffer = readFixture("blwh_ensemble_2026-09-15.gri");

describe("parseLatestRasterDate", () => {
  it("finds the newest date among the rasters manifest entries, not just the last item in the array", () => {
    const shuffled = JSON.parse(JSON.stringify(manifest));
    const rastersEntry = shuffled.find((e: { dirname: string }) => e.dirname === "rasters");
    rastersEntry.items.reverse();

    expect(parseLatestRasterDate(shuffled)).toBe("2026-09-15");
  });

  it("throws when the manifest has no rasters entry", () => {
    expect(() => parseLatestRasterDate([{ dirname: "flyers", items: [] }])).toThrow(/rasters/i);
  });
});

describe("rasterUrl", () => {
  it("builds the correct oceanview.pfeg.noaa.gov URL for a given date and extension", () => {
    expect(rasterUrl("2026-09-15", "gri")).toBe(
      "https://oceanview.pfeg.noaa.gov/WhaleWatch2/output/rasters/blwh_ensemble_2026-09-15.gri",
    );
  });
});

describe("fetchLatestProbabilityGrid", () => {
  it("fetches the manifest, resolves the latest date, fetches+decodes that day's raster, and returns a schema-valid grid", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href === MANIFEST_URL) {
        return new Response(JSON.stringify(manifest));
      }
      if (href.endsWith(".grd")) {
        return new Response(grdText);
      }
      if (href.endsWith(".gri")) {
        return new Response(griBuffer);
      }
      throw new Error(`unexpected fetch: ${href}`);
    });

    const grid = await fetchLatestProbabilityGrid(fetchImpl as unknown as typeof fetch);

    expect(grid.species).toBe("blue-whale");
    expect(grid.modelDate).toBe("2026-09-15");
    expect(grid.rows).toBe(180);
    expect(grid.cols).toBe(185);
    expect(grid.cells).toHaveLength(15_270);
    expect(grid.attribution.publisherName).toMatch(/NOAA/);
    expect(grid.attribution.license.commercialUse).toBe(true);
  });

  it("rejects when the manifest fetch fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(fetchLatestProbabilityGrid(fetchImpl as unknown as typeof fetch)).rejects.toThrow();
  });

  it("rejects when the manifest response isn't shaped like a manifest — never trust an unvalidated response (see apiClient.ts's own convention)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (url.toString() === MANIFEST_URL) {
        // A reshaped/broken manifest: an object instead of an array.
        return new Response(JSON.stringify({ oops: "not an array" }));
      }
      throw new Error("should not fetch rasters if the manifest itself is invalid");
    });

    await expect(fetchLatestProbabilityGrid(fetchImpl as unknown as typeof fetch)).rejects.toThrow();
  });

  it("rejects when a raster's cells aren't square (resolutionDegrees would silently misreport the true cell size)", async () => {
    const nonSquareGrdText = grdText.replace("ymax=48", "ymax=50"); // widens yres without touching xres
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href === MANIFEST_URL) return new Response(JSON.stringify(manifest));
      if (href.endsWith(".grd")) return new Response(nonSquareGrdText);
      if (href.endsWith(".gri")) return new Response(griBuffer);
      throw new Error(`unexpected fetch: ${href}`);
    });

    await expect(fetchLatestProbabilityGrid(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /square/i,
    );
  });
});
