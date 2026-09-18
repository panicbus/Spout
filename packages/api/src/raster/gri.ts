const BYTES_PER_FLOAT = 4;

/**
 * Decodes a WhaleWatch 2.0 `.gri` file: a flat little-endian float32
 * grid, row-major (BIL band order, single band), row 0 first.
 *
 * Nodata cells are `NaN` in the real files, NOT the `-3.4e38` sentinel
 * the companion `.grd` header declares (verified by byte-level decode —
 * see `fixtures/whalewatch/README.md` and ADR 0002). This function makes
 * no judgment about which cells are nodata; it returns the raw decoded
 * values, `NaN`s included, because a comparison like `value <= -3.4e38`
 * would silently pass every `NaN` straight through (any comparison
 * against `NaN` is `false`). Filter with `Number.isFinite` downstream —
 * `rasterToCells.ts` does exactly that.
 */
export function decodeGri(
  buffer: Buffer | ArrayBuffer,
  { rows, cols }: { rows: number; cols: number },
): number[] {
  const expectedLength = rows * cols * BYTES_PER_FLOAT;
  const byteLength = buffer.byteLength;
  if (byteLength !== expectedLength) {
    throw new Error(
      `.gri buffer is ${byteLength} bytes; expected ${expectedLength} (${rows}x${cols} float32) — likely a truncated or wrong-shaped download`,
    );
  }

  // Three-arg DataView over the Buffer's existing backing ArrayBuffer —
  // no copy. `.slice()` on `buffer.buffer` would duplicate the entire
  // raster (130KB+ for the real fixture, on every fetch) just to build a
  // read-only view over bytes we already have in memory.
  const view = Buffer.isBuffer(buffer)
    ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new DataView(buffer);
  const count = rows * cols;
  const values = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    values[i] = view.getFloat32(i * BYTES_PER_FLOAT, true);
  }
  return values;
}
