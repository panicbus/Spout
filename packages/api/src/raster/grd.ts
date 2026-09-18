import type { Bbox } from "@spout/contracts";

export interface GrdHeader {
  rows: number;
  cols: number;
  bbox: Bbox;
  nodataValue: number;
}

const REQUIRED_KEYS = ["nrows", "ncols", "xmin", "ymin", "xmax", "ymax", "nodatavalue"] as const;

/**
 * Parses a WhaleWatch 2.0 `.grd` file — an INI-shaped text header the R
 * `raster` package writes alongside its `.gri` binary. Only pulls the
 * georeference fields this app actually uses; the file also carries a
 * `wkt`/`projection` block we don't need (WhaleWatch always ships plain
 * WGS84 lon/lat).
 *
 * `nodataValue` is parsed and returned, but `gri.ts` does NOT rely on it
 * to detect nodata cells — see that module's doc comment for why (the
 * real files encode nodata as `NaN`, not this declared sentinel).
 */
export function parseGrdHeader(text: string): GrdHeader {
  const fields: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("[")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    fields[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in fields)) {
      throw new Error(`.grd header is missing required field "${key}"`);
    }
    // A present-but-empty value (e.g. "xmin=") coerces to 0 via
    // Number(""), not NaN — Number.isNaN alone wouldn't catch it, and a
    // silently-wrong xmin corrupts every cell's longitude with no thrown
    // error (exactly the class of bug the orientation tests in
    // rasterToCells.test.ts are careful about).
    const value = fields[key] as string;
    if (value.trim() === "" || Number.isNaN(Number(value))) {
      throw new Error(`.grd header field "${key}" is not a valid number: "${value}"`);
    }
  }

  return {
    rows: Number(fields.nrows),
    cols: Number(fields.ncols),
    bbox: [Number(fields.xmin), Number(fields.ymin), Number(fields.xmax), Number(fields.ymax)],
    nodataValue: Number(fields.nodatavalue),
  };
}
