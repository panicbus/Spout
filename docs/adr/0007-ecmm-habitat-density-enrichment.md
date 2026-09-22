# 0007: ECMM habitat-model density as a second, independent figure (Phase 4)

## Status

Accepted (2026-09-22)

## Context

ADR 0006 anticipated this as a future addition: Duke University Marine
Geospatial Ecology Laboratory's "ECMM" habitat-based cetacean density
models, served through NOAA's CoastWatch ERDDAP (`coastwatch.pfeg.noaa.gov`),
as a second figure alongside the GBIF-sighting-based `share` — never a
replacement, since the two answer genuinely different questions (modeled
habitat suitability vs. what was actually reported).

Verified live before building anything (2026-09-22), correcting two
assumptions from the original research:

- **Not every ECMM dataset is a monthly climatology.** Of the 4 species
  this product tracks, 3 have an Atlantic model at all (gray whale is a
  genuine Pacific/Arctic migrant, absent from this Atlantic-only
  project — not a coverage gap in our lookup): `ECMM_Humpback_whale`,
  `ECMM_Blue_whale`, `ECMM_Killer_whale`. Only humpback's dataset ships a
  real 12-month climatology (`time`'s `actual_range` spans
  2014-01-16..2014-12-16). Blue whale and killer whale each publish a
  single year-round average — their `time` axis's `actual_range` is one
  fixed value (2009-07-02T12:00:00Z for both), confirmed by querying each
  dataset's own `.das` metadata directly. Requesting a monthly date
  against either of those two 404s. `ecmmDensity.ts` records this
  per-dataset (`temporal: "monthly" | "annual"`) and queries `(last)`
  instead of a month-mapped date for the annual ones, rather than
  assuming uniform monthly resolution across species.
- **All three datasets share one grid bbox** (verified identical via each
  dataset's own `.das` `actual_range`): lat 23.156–47.702, lon
  −82.347 to −56.237 — the U.S. Atlantic coast and northern Gulf of
  Mexico. Checked client-side before any network call, so a tap in
  California costs nothing extra.
- Licensed CC BY 4.0. Citation: Roberts, J., Best, B., Mannocci, L. et
  al. "Habitat-based cetacean density models for the U.S. Atlantic and
  Gulf of Mexico." Sci Rep 6, 22615 (2016). Attribution required.

## Decision

`fetchEcmmDensity` (`packages/api/src/sources/ecmmDensity.ts`)
point-queries the matching dataset for `(species, lat, lon, month)` and
returns a density in animals per 100 km², or `undefined` for: no model
for this species, outside the shared bbox, a valid grid cell with no
estimate (e.g. land), or any upstream failure. **It never throws** — this
is enrichment on top of the GBIF-based answer, not a dependency of it; a
Duke/NOAA outage must never take `/api/seasonality` down.

`fetchSeasonalityWithDensity` (`packages/api/src/sources/seasonalityWithDensity.ts`)
composes it with `fetchSeasonality`, and is now `SeasonalityCache`'s
default fetcher — every real request goes through both sources.
`SeasonalityResponseSchema` gained an optional `estimatedDensity` field,
following the same honesty convention as `share`: omitted, never
fabricated, when there's genuinely nothing to report.

The frontend (`SeasonalityCard.tsx`) renders it as a distinct second line
per species row — its own smaller/muted styling, its own explanatory
note ("modeled, not reported") — never merged into the `share` percentage
or its color. `DataCreditsPanel.tsx` carries the required CC BY 4.0
attribution and citation.

## Consequences

- `estimatedDensity` is commonly `undefined` — most of this app's likely
  usage (California, the Pacific generally) is outside ECMM's coverage
  entirely, and gray whale never has one anywhere. This is real
  geographic/taxonomic scope, not a bug to work around.
- The two figures must stay visually and semantically distinct in the UI
  permanently — a future change that visually merges "share of reported
  sightings" and "modeled habitat density" into one number would
  misrepresent both.
- If Duke/NOAA ever republishes blue whale or killer whale with a true
  monthly climatology, `ecmmDensity.ts`'s `temporal` flag for that
  species should flip to `"monthly"` — worth a periodic live check, not
  an assumption that today's shape is permanent.
