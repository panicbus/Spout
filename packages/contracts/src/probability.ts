import { z } from "zod";
import { BboxSchema } from "./bbox.js";
import { AttributionSchema } from "./source.js";

const ProbabilityCellSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  probability: z.number().min(0).max(1),
});

/**
 * WhaleWatch 2.0's ensemble model is blue-whale-only, so `species` is a
 * literal rather than the full `SpeciesSchema` enum — accepting anything
 * else would misrepresent what the model actually covers (ADR 0002).
 */
export const ProbabilityGridSchema = z
  .object({
    species: z.literal("blue-whale"),
    /** The date of the source raster this grid was decoded from (the model's own date, not today). */
    modelDate: z.string().min(1),
    /** When Spout fetched and decoded this grid. */
    generatedAt: z.string().min(1),
    bbox: BboxSchema,
    rows: z.number().int().positive(),
    cols: z.number().int().positive(),
    resolutionDegrees: z.number().positive(),
    /**
     * Nodata cells are legitimately dropped during decoding (the real
     * WhaleWatch 2.0 raster has 15,270 valid cells out of 33,300 —
     * roughly 46%), so this is sparser than `rows * cols`, never denser.
     */
    cells: z.array(ProbabilityCellSchema),
    attribution: AttributionSchema,
  })
  .refine((grid) => grid.cells.length <= grid.rows * grid.cols, {
    message: "cells.length must not exceed rows * cols — indicates a corrupted raster decode",
    path: ["cells"],
  });
export type ProbabilityGrid = z.infer<typeof ProbabilityGridSchema>;
export type ProbabilityCell = z.infer<typeof ProbabilityCellSchema>;
