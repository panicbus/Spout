import type { Bbox, ProbabilityCell } from "@spout/contracts";

export interface RasterShape {
  rows: number;
  cols: number;
  bbox: Bbox;
}

/**
 * Converts a flat, row-major raster (as `gri.ts` decodes it) into the
 * sparse cell list `ProbabilityGridSchema` expects, dropping non-finite
 * (nodata) cells.
 *
 * Orientation: row 0 is the grid's NORTH edge (`bbox[3]`, `ymax`),
 * increasing row moves south; col 0 is the WEST edge (`bbox[0]`, `xmin`),
 * increasing col moves east. This matches the R `raster` package's
 * standard row-major-from-the-top layout (WhaleWatch 2.0's `.grd` files
 * say `creator=R package 'raster'`) and was confirmed empirically before
 * writing this function: the real fixture's single highest-probability
 * cell lands at ~34.15N, ~120.45W (open water off Point Conception, a
 * documented blue whale hotspot) under this orientation, versus ~43.85N,
 * 120.45W (dry land in central Oregon, nowhere near either whales or the
 * coast) under the opposite one.
 */
export function rasterToCells(values: number[], { rows, cols, bbox }: RasterShape): ProbabilityCell[] {
  if (values.length !== rows * cols) {
    throw new Error(
      `values.length (${values.length}) does not match rows*cols (${rows * cols})`,
    );
  }

  const [xmin, , , ymax] = bbox;
  const xres = (bbox[2] - bbox[0]) / cols;
  const yres = (bbox[3] - bbox[1]) / rows;

  const cells: ProbabilityCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const value = values[row * cols + col] as number;
      if (!Number.isFinite(value)) continue;
      cells.push({
        lat: ymax - (row + 0.5) * yres,
        lon: xmin + (col + 0.5) * xres,
        probability: value,
      });
    }
  }
  return cells;
}
