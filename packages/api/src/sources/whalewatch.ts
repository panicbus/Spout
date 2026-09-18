import { ProbabilityGridSchema, type Attribution, type ProbabilityGrid } from "@spout/contracts";
import { z } from "zod";
import { parseGrdHeader } from "../raster/grd.js";
import { decodeGri } from "../raster/gri.js";
import { rasterToCells } from "../raster/rasterToCells.js";

export const MANIFEST_URL = "https://oceanview.pfeg.noaa.gov/WhaleWatch2/showfiles.php";
const RASTER_BASE_URL = "https://oceanview.pfeg.noaa.gov/WhaleWatch2/output/rasters";
const DATE_PATTERN = /blwh_ensemble_(\d{4}-\d{2}-\d{2})\.gri$/;

/**
 * NOAA states this product "is solely the responsibility of the
 * WhaleWatch 2.0 project and is not associated with NOAA CoastWatch" —
 * both facts belong in the credit line, not just this comment (ADR 0002).
 */
const ATTRIBUTION: Attribution = {
  datasetName: "WhaleWatch 2.0 blue whale habitat suitability",
  datasetId: "whalewatch2-blue-whale-ensemble",
  publisherName: "NOAA WhaleWatch 2.0",
  publisherId: "noaa-whalewatch2",
  citation:
    "Abrahms et al. 2019, Diversity & Distributions, doi:10.1111/ddi.12940. Product is solely the responsibility of the WhaleWatch 2.0 project and is not associated with NOAA CoastWatch.",
  attributionUrl: "https://coastwatch.pfeg.noaa.gov/projects/whalewatch2/about_whalewatch2.html",
  license: { id: "public-domain", commercialUse: true },
};

/**
 * Every other external payload in this codebase gets `Schema.parse`'d
 * before it's trusted (see `apiClient.ts`'s own house convention) — the
 * manifest is no exception. Loose on purpose (`.passthrough()`-free but
 * only requires the two fields this module actually reads): a reshaped
 * manifest should fail here with a clear message, not three calls later
 * as a raw `TypeError` from `.items.map(...)` on something that isn't
 * an array.
 */
const ManifestEntrySchema = z.object({
  dirname: z.string(),
  items: z.array(z.string()),
});
const ManifestSchema = z.array(ManifestEntrySchema);
type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

/**
 * There is no `_latest` alias on this server — it 200s but returns the
 * site's own HTML shell, not raster data (verified; see ADR 0002). The
 * current date has to be found by reading the manifest and taking the
 * newest date among the `rasters` entry's filenames — NOT just the last
 * array item, since the manifest's own ordering isn't a documented
 * contract.
 */
export function parseLatestRasterDate(manifest: ManifestEntry[]): string {
  const rasters = manifest.find((entry) => entry.dirname === "rasters");
  if (!rasters) {
    throw new Error("WhaleWatch2 manifest has no 'rasters' entry");
  }

  const dates = rasters.items
    .map((name) => DATE_PATTERN.exec(name)?.[1])
    .filter((date): date is string => Boolean(date));

  if (dates.length === 0) {
    throw new Error("WhaleWatch2 manifest's 'rasters' entry has no dated .gri files");
  }

  return dates.sort().at(-1) as string;
}

export function rasterUrl(date: string, ext: "grd" | "gri"): string {
  return `${RASTER_BASE_URL}/blwh_ensemble_${date}.${ext}`;
}

/**
 * Fetches the manifest, resolves the latest available date, fetches and
 * decodes that day's `.grd`+`.gri` pair, and returns a schema-validated
 * `ProbabilityGrid`. Takes `fetchImpl` as a parameter rather than
 * importing the global `fetch` directly, so tests can inject a fixture-
 * backed fake instead of hitting the real network (oceanview.pfeg.noaa.gov
 * sends no CORS header, so this proxying is also the only way the
 * frontend can ever reach this data — see ADR 0002).
 */
export async function fetchLatestProbabilityGrid(
  fetchImpl: typeof fetch = fetch,
): Promise<ProbabilityGrid> {
  const manifestRes = await fetchImpl(MANIFEST_URL);
  if (!manifestRes.ok) {
    throw new Error(`WhaleWatch2 manifest fetch failed: ${manifestRes.status}`);
  }
  const manifest = ManifestSchema.parse(await manifestRes.json());
  const date = parseLatestRasterDate(manifest);

  const [grdRes, griRes] = await Promise.all([
    fetchImpl(rasterUrl(date, "grd")),
    fetchImpl(rasterUrl(date, "gri")),
  ]);
  if (!grdRes.ok || !griRes.ok) {
    throw new Error(`WhaleWatch2 raster fetch failed for ${date}`);
  }

  const header = parseGrdHeader(await grdRes.text());
  const griBuffer = await griRes.arrayBuffer();
  const values = decodeGri(griBuffer, header);
  const cells = rasterToCells(values, header);

  // resolutionDegrees is a single scalar on ProbabilityGridSchema, which
  // only makes sense for square cells. Every real WhaleWatch2 file has
  // been square so far (xres === yres === 0.1), but nothing upstream
  // guarantees that stays true — fail loudly rather than have the X-only
  // resolution silently misreport the true north-south cell size if it
  // ever doesn't.
  const xres = (header.bbox[2] - header.bbox[0]) / header.cols;
  const yres = (header.bbox[3] - header.bbox[1]) / header.rows;
  if (Math.abs(xres - yres) > 1e-6) {
    throw new Error(
      `WhaleWatch2 raster for ${date} has non-square cells (xres=${xres}, yres=${yres}) — resolutionDegrees cannot represent this as a single value`,
    );
  }

  return ProbabilityGridSchema.parse({
    species: "blue-whale",
    modelDate: date,
    generatedAt: new Date().toISOString(),
    bbox: header.bbox,
    rows: header.rows,
    cols: header.cols,
    resolutionDegrees: xres,
    cells,
    attribution: ATTRIBUTION,
  });
}
