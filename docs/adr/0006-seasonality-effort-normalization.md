# 0006: Seasonality reports an effort-normalized share, never an absolute probability

## Status

Accepted (2026-09-21)

## Context

The product's actual goal — "how likely am I to see a whale here, on
this date" — has no real data source that answers it directly. Verified
before building anything (2026-09-21, live requests against every
candidate):

- NOAA WhaleWatch 2.0 is nowcast/hindcast only, blue-whale-only, and
  California-only. A 3-week-ahead forecast exists in the research
  literature (Barlow et al. 2021) but was never published as a data
  product.
- Duke/NOAA's habitat density models (`ECMM_*`, NOAA ERDDAP) are real,
  licensed, monthly climatologies — but US Atlantic only, the wrong
  ocean for this product's current users.
- No global daily (or even monthly) whale probability model exists
  anywhere, keyless or otherwise.

What GBIF's occurrence-search API *can* answer, on demand, per location,
in under a second (verified: a month-faceted query near Monterey Bay
returned 47,352 records in 0.9s): how many of each species were actually
*reported* near a point, broken down by month.

That's a different, weaker claim than "probability of seeing a whale" —
raw report counts measure where people report sightings, not where
whales are. Verified: a 1° bbox of open mid-Pacific ocean returns zero
cetacean reports of any species, despite whales certainly being present
there — reporting effort (nobody's out there logging sightings), not
absence, explains the zero.

## Decision

`fetchSeasonality` (`packages/api/src/sources/gbifSeasonality.ts`)
reports, per species, **the share of all-cetacean reports near this
point, in this calendar month, that were this species** — not an
absolute sighting probability, and not a raw report count. Two GBIF
facet queries run per species (the species itself, and taxonKey 733 —
the whole order Cetacea — as the denominator), drawn from the same
bbox/date-range effort pool, over an 11-year history.

**Below `MIN_SAMPLE_SIZE` (20) all-cetacean reports in that window, share
is omitted entirely — never reported as 0.** Verified live: the
mid-Pacific case returns `sampleSize: 0` and `share: undefined` for
every species, distinct from a real "never seen in a well-sampled month"
0 (verified live at a real location: gray whale genuinely reports 0%
share in a Monterey Bay September with a `sampleSize` of 8,387 — a
real, confident zero, not a data gap wearing the same number).

`SeasonalityResponseSchema` (`packages/contracts/src/seasonality.ts`)
encodes this at the type level: `share` is `optional()`, `sampleSize` is
always present so a caller can see the honesty gate's own input, not
just its output.

## Consequences

- The frontend must never render `share` as "chance of seeing a whale."
  It's "share of reported sightings" — the UI copy has to say that, not
  imply a probability the data doesn't support.
- `sampleSize` has to be visible somewhere in the UI, not just carried
  in the API response — a number with no visible confidence behind it
  reads as more certain than it is.
- If a real, licensed, sufficiently broad probability model is ever
  found (the Phase 4 possibility: US Atlantic `ECMM_*` monthly
  densities, for locations where that's the right ocean), it gets added
  as a *second*, clearly-labeled figure alongside this one — not a
  silent replacement, since the two numbers answer genuinely different
  questions and neither one is what the other pretends to be.
- No global backfill was built and none is needed — every request is
  answered live, per location, from GBIF directly, cached
  (`packages/api/src/store/seasonalityCache.ts`) per `(lat, lon, month)`
  cell for a week at a time (this is historical data; it doesn't go
  stale day to day).
