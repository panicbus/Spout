/**
 * Reads bit `index` (least-significant-bit first within each byte) from a
 * packed `Uint8Array` bitmask — the encoding `ProbabilityGrid.landMask.data`
 * uses (see `probability.ts`'s doc comment) and `packages/api`'s
 * `raster/landMask.ts` produces. Shared here (not duplicated between
 * `packages/api`, which writes these bits, and `packages/web`, which
 * reads them to render) since the two sides must agree on the exact same
 * encoding or the coastline mask silently misaligns.
 *
 * Returns `false` (not a throw) for an out-of-range index — a caller
 * iterating a fixed `rows*cols` grid shouldn't have to special-case its
 * own loop bounds against the packed array's byte-rounded length.
 */
export function bitAt(mask: Uint8Array, index: number): boolean {
  const byte = mask[index >> 3];
  return byte !== undefined && (byte & (1 << (index & 7))) !== 0;
}
