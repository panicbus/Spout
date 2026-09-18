# 0004: Sightings ingestion is a rolling ~400-day window, not a full historical backfill

## Status

Accepted (2026-09-18, R2)

## Context

The build plan's R2 line describes GBIF ingestion as "offset chunking by
species × year," which reads as backfilling GBIF's full historical
corpus. Live verification during R2 found this isn't what the product
actually needs, for reasons already partly established in ADR 0002:

- The four supported time windows (`TimeWindowSchema`: `latest`, `30d`,
  `90d`, `12m`) top out at 365 days. Nothing in the product ever asks for
  more than a year of history.
- ADR 0002 already found the corpus is dominated by decades-old data —
  Cascadia's blue-whale records alone: 1990s 3,571, 2000s 2,562, 2010s
  1,913, 2020s 3,103 — and decided the sightings layer must never default
  to all-time for exactly this reason (a full backfill would present
  1990s survey tracklines as if they were current).
- Live full-history counts per species in the CA bbox, verified during
  R2's review: humpback 79,415, blue 12,049, gray 23,657, orca 2,855.
  Humpback alone is already at ~80% of GBIF's 100,000 offset cap per
  query and growing — a real full backfill would need the plan's
  described year-by-year chunking to stay under that cap; a ~400-day
  window does not (current per-species-per-window counts are in the
  thousands, nowhere near the cap), so that chunking was never built.

## Decision

`packages/api/src/store/sightingsRefresh.ts` ingests a rolling window:

- **Cold start** (the store has never been populated): back-fills the
  last `BACKFILL_DAYS = 400` days — wide enough to cover the longest
  served window (`12m`) with a 35-day margin.
- **Every refresh after that**: re-fetches only the last
  `INCREMENTAL_REFRESH_OVERLAP_DAYS = 5` days, relying on
  `upsertSightings`'s replace-by-id semantics to safely re-ingest that
  small overlap. This is what makes the refresh cost actually shrink
  after the first backfill, instead of costing the same as a full
  backfill forever (see the module's own doc comment).

The database will never contain a sighting observed more than ~400 days
ago unless this decision is deliberately revisited.

## Consequences

- No year-by-year GBIF chunking exists; `MAX_OFFSET` in
  `sources/gbif.ts` is a safety net against ever approaching the real
  cap, not an active mitigation, and would need to become one (chunk by
  species × year) if this window is ever widened toward full history.
- A future "historical sightings" or "all-time hotspot" feature is not
  supported by the current store and would need this decision revisited
  first, not just a wider `window` value added to `TimeWindowSchema`.
- Matches ADR 0002's own "never all-time" reasoning for the *default*
  view; this ADR extends that same reasoning to what gets *ingested* at
  all, not just what's shown by default.
