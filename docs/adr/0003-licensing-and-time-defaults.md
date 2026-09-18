# 0003: Per-record licensing is stored from day one; time filter defaults to 30 days

## Status

Accepted (2026-09-18)

## Context

Two product-shaping facts emerged from data verification (see ADR 0002) that
the spec did not anticipate:

1. **Licensing.** GBIF facets show 64% of blue-whale CA-bbox records are
   `CC_BY_NC_4_0` (non-commercial). iNaturalist records are similarly mixed
   (`cc-by-nc` or all-rights-reserved when unlicensed). This is a corpus-wide
   constraint, not a per-feature choice: it rules out ads or a paid tier on
   this data unless the corpus itself is filtered down to CC0/CC-BY records
   only (roughly 36% of the corpus, thinner map).
2. **Time filter.** GBIF has zero records in the last 7 days for any target
   species on the date verified (see ADR 0002); a "Today"/"This Week" filter
   as specced would show an empty map on a typical day.

## Decision

- **Licensing:** ship v1 against the full corpus (maximum coverage, matches
  the spec's read-only public-good framing), but store `license`,
  `datasetName`, and `datasetKey`/`publishingOrgKey` on every normalized
  record from the first ingest, and route every store/API query through a
  `commercialOnly` filter parameter that is unused today but requires no
  re-ingest to switch on later. The per-record license is shown on every
  detail card regardless.
- **Time filter:** the sightings layer defaults to **last 30 days**. "Today"
  is renamed **"Latest reports"** and is driven by iNaturalist's direct API
  (the only source with sub-30-day data), not GBIF. Every view shows a
  "most recent report: N days ago" stamp so a thin result set reads as an
  honest reflection of the data, not a broken app.

## Consequences

- No monetization (ads, paid tier) is planned or enabled for v1 under this
  decision; flipping it on later is a query-parameter change, not a
  migration, because licensing metadata already exists per record.
- The UI must never let a stale or empty result set look like "no whales
  right now" when it actually means "the data pipeline hasn't caught up
  yet" — the recency stamp is a correctness requirement, not a nicety.
