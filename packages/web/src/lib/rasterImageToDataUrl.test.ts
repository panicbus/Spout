import { describe, expect, it } from "vitest";
import { rasterImageToDataUrl } from "./rasterImageToDataUrl.js";

describe("rasterImageToDataUrl", () => {
  it("encodes a ProbabilityRasterImage as a PNG data URL", () => {
    const pixels = new Uint8ClampedArray(2 * 2 * 4);
    pixels.set([255, 0, 0, 255], 0); // one opaque red pixel, rest transparent

    const url = rasterImageToDataUrl({ width: 2, height: 2, pixels });

    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});
