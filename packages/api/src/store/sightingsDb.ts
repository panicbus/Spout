import Database from "better-sqlite3";
import type { Bbox, Sighting, SourceTier, Species } from "@spout/contracts";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sightings (
    id TEXT PRIMARY KEY,
    species TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    observed_at TEXT NOT NULL,
    tier TEXT NOT NULL,
    source_api TEXT NOT NULL,
    verification TEXT NOT NULL,
    coordinates_obscured INTEGER NOT NULL,
    positional_uncertainty_m REAL,
    dataset_name TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    publisher_name TEXT NOT NULL,
    publisher_id TEXT NOT NULL,
    citation TEXT,
    attribution_url TEXT,
    license_id TEXT NOT NULL,
    license_url TEXT,
    license_commercial_use INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sightings_bbox ON sightings(lat, lon);
  CREATE INDEX IF NOT EXISTS idx_sightings_observed_at ON sightings(observed_at);
`;

/**
 * `CREATE TABLE IF NOT EXISTS` only creates the table on a brand-new
 * database — it does nothing for a column added after a real on-disk
 * database already exists (R2/R3's local dev DB and any deployed one),
 * so a genuinely new column needs its own explicit, idempotent
 * `ALTER TABLE`. Checked via `PRAGMA table_info` rather than a blind
 * try/catch around "duplicate column name", so a real ALTER failure
 * (not just "already applied") still surfaces instead of being silently
 * swallowed.
 */
function migrate(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(sightings)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "photo_url")) {
    db.exec("ALTER TABLE sightings ADD COLUMN photo_url TEXT");
  }
  if (!columns.some((column) => column.name === "happywhale_url")) {
    db.exec("ALTER TABLE sightings ADD COLUMN happywhale_url TEXT");
  }
}

/**
 * Opens (creating if needed) the sightings SQLite database. `:memory:`
 * for tests; a real file path in production so a backfilled corpus
 * survives a process restart (unlike `ProbabilityCache`, which has
 * nothing worth persisting — a single grid, refetched cheaply).
 */
export function openSightingsDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

interface SightingRow {
  id: string;
  species: string;
  lat: number;
  lon: number;
  observed_at: string;
  tier: string;
  source_api: string;
  verification: string;
  coordinates_obscured: number;
  positional_uncertainty_m: number | null;
  photo_url: string | null;
  happywhale_url: string | null;
  dataset_name: string;
  dataset_id: string;
  publisher_name: string;
  publisher_id: string;
  citation: string | null;
  attribution_url: string | null;
  license_id: string;
  license_url: string | null;
  license_commercial_use: number;
}

function rowToSighting(row: SightingRow): Sighting {
  return {
    id: row.id,
    species: row.species as Species,
    lat: row.lat,
    lon: row.lon,
    observedAt: row.observed_at,
    tier: row.tier as SourceTier,
    sourceApi: row.source_api as Sighting["sourceApi"],
    verification: row.verification as Sighting["verification"],
    coordinatesObscured: Boolean(row.coordinates_obscured),
    positionalUncertaintyMeters: row.positional_uncertainty_m ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    happywhaleUrl: row.happywhale_url ?? undefined,
    attribution: {
      datasetName: row.dataset_name,
      datasetId: row.dataset_id,
      publisherName: row.publisher_name,
      publisherId: row.publisher_id,
      citation: row.citation ?? undefined,
      attributionUrl: row.attribution_url ?? undefined,
      license: {
        id: row.license_id,
        url: row.license_url ?? undefined,
        commercialUse: Boolean(row.license_commercial_use),
      },
    },
  };
}

// INSERT OR REPLACE, not ON CONFLICT DO UPDATE SET: every column is
// unconditionally overwritten on conflict, with no partial-merge logic
// distinguishing insert from update, so REPLACE does exactly the same
// thing in one clause instead of three separately-maintained column
// lists (INSERT columns, VALUES placeholders, DO UPDATE SET) that a
// future schema change would otherwise have to edit in sync.
const UPSERT_SQL = `
  INSERT OR REPLACE INTO sightings (
    id, species, lat, lon, observed_at, tier, source_api, verification,
    coordinates_obscured, positional_uncertainty_m, photo_url, happywhale_url,
    dataset_name, dataset_id, publisher_name, publisher_id, citation, attribution_url,
    license_id, license_url, license_commercial_use
  ) VALUES (
    @id, @species, @lat, @lon, @observedAt, @tier, @sourceApi, @verification,
    @coordinatesObscured, @positionalUncertaintyMeters, @photoUrl, @happywhaleUrl,
    @datasetName, @datasetId, @publisherName, @publisherId, @citation, @attributionUrl,
    @licenseId, @licenseUrl, @licenseCommercialUse
  )
`;

/**
 * Inserts or replaces sightings by `id` — a refresh re-fetching the same
 * date range re-upserts the same ids instead of accumulating duplicates.
 */
export function upsertSightings(db: Database.Database, sightings: Sighting[]): void {
  const stmt = db.prepare(UPSERT_SQL);
  const insertAll = db.transaction((rows: Sighting[]) => {
    for (const sighting of rows) {
      stmt.run({
        id: sighting.id,
        species: sighting.species,
        lat: sighting.lat,
        lon: sighting.lon,
        observedAt: sighting.observedAt,
        tier: sighting.tier,
        sourceApi: sighting.sourceApi,
        verification: sighting.verification,
        coordinatesObscured: sighting.coordinatesObscured ? 1 : 0,
        positionalUncertaintyMeters: sighting.positionalUncertaintyMeters ?? null,
        photoUrl: sighting.photoUrl ?? null,
        happywhaleUrl: sighting.happywhaleUrl ?? null,
        datasetName: sighting.attribution.datasetName,
        datasetId: sighting.attribution.datasetId,
        publisherName: sighting.attribution.publisherName,
        publisherId: sighting.attribution.publisherId,
        citation: sighting.attribution.citation ?? null,
        attributionUrl: sighting.attribution.attributionUrl ?? null,
        licenseId: sighting.attribution.license.id,
        licenseUrl: sighting.attribution.license.url ?? null,
        licenseCommercialUse: sighting.attribution.license.commercialUse ? 1 : 0,
      });
    }
  });
  insertAll(sightings);
}

export interface SightingsFilter {
  bbox?: Bbox;
  species?: Species[];
  tier?: SourceTier[];
  /** YYYY-MM-DD — only sightings observed on or after this date. */
  sinceDate?: string;
  commercialOnly?: boolean;
  /** Hard cap on rows returned. Defaults to `DEFAULT_QUERY_LIMIT`. */
  limit?: number;
}

/** Default/max rows a single query returns — `SightingsLayer` clusters client-side, so it never needs every raw row in one response; a hard cap keeps `/api/sightings` from serializing an unbounded table as the corpus grows (flagged in the original architecture notes, A5: "the fix is server-side clustering/zoom-dependent aggregation + a hard LIMIT"). */
const DEFAULT_QUERY_LIMIT = 5000;

/**
 * Bbox filtering uses a plain `lat`/`lon` range over the composite index
 * above. Verified via `EXPLAIN QUERY PLAN` against a 50k-row synthetic
 * table: SQLite only uses the index to seek on `lat` (the leftmost
 * column); the `lon BETWEEN` clause is a residual per-row filter, not a
 * second seek dimension — the standard leftmost-prefix limitation of a
 * composite B-tree index applied to two independent ranges, not a true
 * 2D spatial index. Fine at today's row count (a few thousand); this bbox
 * path isn't even exercised by the shipped frontend yet (`SightingsLayer`
 * fetches unfiltered) — revisit with a real row-count/EXPLAIN check once
 * viewport-based bbox fetching is actually built, rather than treating
 * "fine at this scale" as permanent.
 */
export function querySightings(db: Database.Database, filter: SightingsFilter): Sighting[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.bbox) {
    const [minLon, minLat, maxLon, maxLat] = filter.bbox;
    clauses.push("lat BETWEEN @minLat AND @maxLat", "lon BETWEEN @minLon AND @maxLon");
    Object.assign(params, { minLat, maxLat, minLon, maxLon });
  }

  if (filter.species && filter.species.length > 0) {
    const placeholders = filter.species.map((_, i) => `@species${i}`);
    clauses.push(`species IN (${placeholders.join(", ")})`);
    filter.species.forEach((s, i) => (params[`species${i}`] = s));
  }

  if (filter.tier && filter.tier.length > 0) {
    const placeholders = filter.tier.map((_, i) => `@tier${i}`);
    clauses.push(`tier IN (${placeholders.join(", ")})`);
    filter.tier.forEach((t, i) => (params[`tier${i}`] = t));
  }

  if (filter.sinceDate) {
    // Known, accepted limitation: `observed_at` is stored verbatim from
    // GBIF's `eventDate` (see normalize/sighting.ts), which carries no
    // timezone — real values look like "2026-08-06T13:21" or
    // "2026-08-02" with no offset, plausibly local Pacific time for a
    // California-coast observation, not UTC. `sinceDate` is a UTC
    // calendar date (timeWindow.ts). The string comparison below is
    // lexicographically consistent (both sides share a YYYY-MM-DD
    // prefix), but its semantic boundary can be off by up to the UTC
    // offset (~7-8h for Pacific time) right at a window's edge — a
    // sighting from very late one day can fall on the "wrong" side of a
    // window cutoff. Not fixed here: GBIF doesn't declare the true
    // source timezone, so normalizing to a guessed one could introduce
    // a different, less visible error for records that were already
    // correct. Revisit if this proves to matter in practice.
    clauses.push("observed_at >= @sinceDate");
    params.sinceDate = filter.sinceDate;
  }

  if (filter.commercialOnly) {
    clauses.push("license_commercial_use = 1");
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  params.limit = filter.limit ?? DEFAULT_QUERY_LIMIT;
  const rows = db
    .prepare(`SELECT * FROM sightings ${where} LIMIT @limit`)
    .all(params) as SightingRow[];
  return rows.map(rowToSighting);
}

/** Whether the store has ever been populated at all, from any source — see `hasGbifSightings` for the source-scoped variant `sightingsRefresh.ts` actually needs. */
export function hasSightings(db: Database.Database): boolean {
  return db.prepare("SELECT 1 FROM sightings LIMIT 1").get() !== undefined;
}

/**
 * Whether GBIF has ever contributed a row — distinct from `hasSightings`
 * (any source), and what `sightingsRefresh.ts` actually needs to gate its
 * cold-start-vs-incremental backfill decision. Without this distinction,
 * a fast iNaturalist-direct refresh (R3, `inaturalistRefresh.ts`) landing
 * first on a fresh deploy — plausible, since both refresh caches are
 * simultaneously cold on startup — would make `hasSightings(db)` return
 * true before GBIF ever ran, permanently skipping its 400-day backfill in
 * favor of the 5-day incremental window forever, with no error.
 *
 * Filters by `dataset_id`, not `source_api`: R3's GBIF↔iNaturalist de-dup
 * convergence (`normalize/sighting.ts`) remaps some genuinely GBIF-origin
 * rows to `source_api = "inaturalist"`, but their `dataset_id` still
 * correctly carries GBIF's real dataset key — `"inaturalist-api-direct"`
 * is the one `dataset_id` value that's reserved specifically for
 * iNaturalist's own direct API (`normalize/inaturalist.ts`) and never
 * used by anything GBIF-origin.
 */
export function hasGbifSightings(db: Database.Database): boolean {
  return (
    db.prepare("SELECT 1 FROM sightings WHERE dataset_id != 'inaturalist-api-direct' LIMIT 1").get() !==
    undefined
  );
}
