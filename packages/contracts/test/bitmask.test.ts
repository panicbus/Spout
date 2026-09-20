import { describe, expect, it } from "vitest";
import { bitAt } from "../src/bitmask.js";

describe("bitAt", () => {
  it("reads a set bit as true", () => {
    const mask = new Uint8Array([0b00000001]);
    expect(bitAt(mask, 0)).toBe(true);
  });

  it("reads an unset bit as false", () => {
    const mask = new Uint8Array([0b00000000]);
    expect(bitAt(mask, 0)).toBe(false);
  });

  it("indexes bits within a byte least-significant-bit first", () => {
    const mask = new Uint8Array([0b00000100]); // bit index 2 set
    expect(bitAt(mask, 0)).toBe(false);
    expect(bitAt(mask, 1)).toBe(false);
    expect(bitAt(mask, 2)).toBe(true);
    expect(bitAt(mask, 3)).toBe(false);
  });

  it("indexes across byte boundaries", () => {
    const mask = new Uint8Array([0b00000000, 0b00000001]); // bit index 8 set
    expect(bitAt(mask, 7)).toBe(false);
    expect(bitAt(mask, 8)).toBe(true);
  });

  it("returns false for an out-of-range index rather than throwing", () => {
    const mask = new Uint8Array([0b11111111]);
    expect(bitAt(mask, 100)).toBe(false);
  });
});
