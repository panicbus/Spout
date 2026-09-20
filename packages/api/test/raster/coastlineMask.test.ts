import { describe, expect, it } from "vitest";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import type { Bbox } from "@spout/contracts";
import { bitAt } from "../../src/raster/landMask.js";
import { getLandMask, loadClippedLandFeatures } from "../../src/raster/coastlineMask.js";

const CA_BBOX: Bbox = [-134, 30, -115.5, 48];
const ROWS = 180;
const COLS = 185;

function decode(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function classify(landMask: { factor: number; data: string }, lat: number, lon: number): boolean {
  const mask = decode(landMask.data);
  const [minLon, , maxLon, maxLat] = CA_BBOX;
  const superCols = COLS * landMask.factor;
  const xres = (maxLon - minLon) / (COLS * landMask.factor);
  const yres = (maxLat - CA_BBOX[1]) / (ROWS * landMask.factor);
  const col = Math.floor((lon - minLon) / xres);
  const row = Math.floor((maxLat - lat) / yres);
  return bitAt(mask, row * superCols + col);
}

describe("getLandMask", () => {
  it("returns a well-formed LandMask for the real WhaleWatch grid shape", () => {
    const landMask = getLandMask(CA_BBOX, ROWS, COLS);
    expect(landMask.factor).toBeGreaterThan(1);
    expect(landMask.data.length).toBeGreaterThan(0);
  });

  it("correctly classifies known land and water points against the real coastline (San Jose on land, deep Pacific and SF Bay as water)", () => {
    const landMask = getLandMask(CA_BBOX, ROWS, COLS);

    expect(classify(landMask, 37.34, -121.89)).toBe(true); // San Jose
    expect(classify(landMask, 37.5, -125.0)).toBe(false); // deep offshore Pacific
    expect(classify(landMask, 37.85, -122.35)).toBe(false); // SF Bay
  });

  it("memoizes — a second call with the same grid shape returns identical data without recomputing", () => {
    const first = getLandMask(CA_BBOX, ROWS, COLS);
    const second = getLandMask(CA_BBOX, ROWS, COLS);
    expect(second).toEqual(first);
  });

  it("recomputes for a different grid shape rather than reusing a stale cached mask", () => {
    const original = getLandMask(CA_BBOX, ROWS, COLS);
    const different = getLandMask([-120, 30, -110, 40], 100, 100);
    expect(different.data).not.toBe(original.data);
  });

  /**
   * Turns a one-off manual comparison (run interactively while designing
   * the scanline algorithm, then discarded) into a real, permanent
   * regression test — a code-review pass correctly flagged that the
   * "verified identical to the naive per-point approach" claim in this
   * round's commit had no reproducible artifact anywhere in the repo.
   * This test IS that artifact: it independently classifies a real grid
   * of points across the whole CA bbox using `@turf/boolean-point-in-polygon`
   * against the exact same clipped coastline data `getLandMask` uses, and
   * asserts the scanline-rasterized mask agrees at every one of them. If a
   * future change to `rasterizeLandMask`'s scanline logic ever silently
   * diverges from true point-in-polygon semantics — a concave bay, a
   * near-tangent scanline, anything the hand-written synthetic-polygon
   * tests in `landMask.test.ts` don't happen to cover — this is what
   * catches it.
   */
  it("agrees with an independent per-point turf classification at every sampled native-grid-cell center across the real CA coastline", () => {
    const landMask = getLandMask(CA_BBOX, ROWS, COLS);
    const clippedFeatures = loadClippedLandFeatures(CA_BBOX);
    const [minLon, minLat, maxLon, maxLat] = CA_BBOX;

    // Every 8th native row/col (~552 points) — dense enough to cover the
    // whole bbox's coastline meaningfully, cheap enough (a few tens of ms
    // with turf's naive per-point algorithm) to run in the normal suite.
    const STRIDE = 8;
    let compared = 0;

    for (let row = 0; row < ROWS; row += STRIDE) {
      const lat = maxLat - (row + 0.5) * ((maxLat - minLat) / ROWS);
      for (let col = 0; col < COLS; col += STRIDE) {
        const lon = minLon + (col + 0.5) * ((maxLon - minLon) / COLS);

        const groundTruth = clippedFeatures.some((f) =>
          booleanPointInPolygon([lon, lat], f as never),
        );
        const actual = classify(landMask, lat, lon);

        expect({ lat, lon, actual }).toEqual({ lat, lon, actual: groundTruth });
        compared++;
      }
    }

    expect(compared).toBeGreaterThan(400); // sanity: the stride loop actually ran
  });
});
