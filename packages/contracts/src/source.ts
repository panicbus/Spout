import { z } from "zod";

/**
 * Trust tier a sighting is displayed under. Tiered by the *publishing
 * organization* of the record (see ADR 0002), never by which upstream API
 * answered the query and never by `basisOfRecord` — both are broken
 * signals here (SanctSound is machine-observed but authoritative; a
 * Cascadia research record and an iNaturalist snapshot can both be
 * "HumanObservation").
 */
export const SOURCE_TIERS = ["research", "citizen", "acoustic"] as const;
export const SourceTierSchema = z.enum(SOURCE_TIERS);
export type SourceTier = z.infer<typeof SourceTierSchema>;

/**
 * Upstream APIs Spout actually calls. OBIS is deliberately absent — its
 * data reaches Spout through GBIF instead (ADR 0002).
 */
export const SOURCE_APIS = ["gbif", "inaturalist", "whalewatch"] as const;
export const SourceApiSchema = z.enum(SOURCE_APIS);
export type SourceApi = z.infer<typeof SourceApiSchema>;

/**
 * `commercialUse` is required, not derived from `id` at read time, so a
 * license this project hasn't classified yet fails normalization loudly
 * instead of defaulting to permissive.
 */
export const LicenseSchema = z.object({
  id: z.string().min(1),
  url: z.string().url().optional(),
  commercialUse: z.boolean(),
});
export type License = z.infer<typeof LicenseSchema>;

export const AttributionSchema = z.object({
  datasetName: z.string().min(1),
  datasetId: z.string().min(1),
  publisherName: z.string().min(1),
  publisherId: z.string().min(1),
  /**
   * `citation`/`attributionUrl` stay optional, unlike every other field
   * here: GBIF's redistribution requirement is satisfied at the dataset
   * level by `datasetName`+`datasetId` alone (OBIS's `/dataset/{id}`
   * citation string is enrichment, not a legal requirement to display).
   * Making them required would reject valid records the normalizer just
   * hasn't fetched a citation for yet — but it also means a normalizer
   * bug that silently drops an available citation isn't caught by this
   * schema; if that turns out to matter, tighten per-source instead of
   * here (GBIF/iNaturalist may never populate `citation`; OBIS-derived
   * records generally can).
   */
  citation: z.string().optional(),
  attributionUrl: z.string().url().optional(),
  license: LicenseSchema,
});
export type Attribution = z.infer<typeof AttributionSchema>;
