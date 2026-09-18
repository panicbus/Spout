import { z } from "zod";

/**
 * `[minLon, minLat, maxLon, maxLat]` — the one bbox shape used by both
 * `ProbabilityGrid` (the raster's coverage area) and `SightingsQuery` (a
 * map-viewport filter). Shared so a future refinement (e.g. enforcing
 * min < max) only has to be written once.
 */
export const BboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Bbox = z.infer<typeof BboxSchema>;
