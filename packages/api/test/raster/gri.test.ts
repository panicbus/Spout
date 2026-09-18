import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeGri } from "../../src/raster/gri.js";

const FIXTURE_PATH = fileURLToPath(
  new URL(
    "../../../../fixtures/whalewatch/blwh_ensemble_2026-09-15.gri",
    import.meta.url,
  ),
);

describe("decodeGri", () => {
  it("decodes the real WhaleWatch 2.0 raster to the exact known values (see fixtures/whalewatch/README.md)", () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const values = decodeGri(buffer, { rows: 180, cols: 185 });

    expect(values).toHaveLength(33_300);

    const finite = values.filter((v) => Number.isFinite(v));
    expect(finite).toHaveLength(15_270);
    expect(Math.min(...finite)).toBeCloseTo(0.015597930178046227, 12);
    expect(Math.max(...finite)).toBeCloseTo(0.9714617729187012, 12);
  });

  it("regression: the real file's nodata cells are NaN, not the .grd header's declared -3.4e38 sentinel", () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const values = decodeGri(buffer, { rows: 180, cols: 185 });

    const nanCount = values.filter((v) => Number.isNaN(v)).length;
    const sentinelCount = values.filter((v) => v <= -3.4e38).length;

    expect(nanCount).toBe(18_030);
    expect(sentinelCount).toBe(0);
  });

  it("throws if the buffer length doesn't match rows*cols*4 bytes — a truncated download must fail loudly", () => {
    const shortBuffer = Buffer.alloc(10);
    expect(() => decodeGri(shortBuffer, { rows: 180, cols: 185 })).toThrow(/133200|bytes/i);
  });

  it("decodes a small synthetic little-endian buffer correctly, including a NaN cell", () => {
    const buffer = Buffer.alloc(4 * 4);
    buffer.writeFloatLE(0.1, 0);
    buffer.writeFloatLE(0.2, 4);
    buffer.writeFloatLE(NaN, 8);
    buffer.writeFloatLE(0.4, 12);

    const values = decodeGri(buffer, { rows: 2, cols: 2 });

    expect(values[0]).toBeCloseTo(0.1, 6);
    expect(values[1]).toBeCloseTo(0.2, 6);
    expect(Number.isNaN(values[2])).toBe(true);
    expect(values[3]).toBeCloseTo(0.4, 6);
  });
});
