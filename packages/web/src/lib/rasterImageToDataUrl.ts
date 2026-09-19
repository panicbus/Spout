import type { ProbabilityRasterImage } from "./probabilityRaster.js";

/**
 * The one place `document.createElement("canvas")` gets touched for the
 * probability layer — everything upstream (`probabilityRaster.ts`) is
 * pure pixel math. Uses `ctx.createImageData()` rather than `new
 * ImageData(...)`: jsdom (this project's unit test environment, once the
 * `canvas` devDependency is installed — see its `package.json` entry and
 * `ProbabilityLayer.tsx`'s doc comment for why) provides a real 2D
 * context but not a global `ImageData` constructor, and
 * `createImageData` works identically in both a real browser and here.
 */
export function rasterImageToDataUrl(image: ProbabilityRasterImage): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("rasterImageToDataUrl: 2D canvas context unavailable");

  const imageData = ctx.createImageData(image.width, image.height);
  imageData.data.set(image.pixels);
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL();
}
