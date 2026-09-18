# 0002: Data sources revised from spec — WhaleWatch is real, OBIS is dropped

## Status

Accepted (2026-09-18)

## Context

`docs/spec.md` proposed three sources: NOAA WhaleWatch 2.0 (probability,
assumed map-only), OBIS-SEAMAP (assumed "confirmed research sightings"),
GBIF/iNaturalist (assumed "unverified citizen occurrence"). Live verification
before building found two of these three premises wrong.

### WhaleWatch 2.0 has a real, keyless, undocumented data endpoint

- Manifest: `https://oceanview.pfeg.noaa.gov/WhaleWatch2/showfiles.php`
  returns JSON listing every daily raster, `output/rasters` from
  2023-04-01 through the present (updates daily, ~3-day lag from "today").
- Each date has `.grd` (plain-text INI georeference header) + `.gri` (raw
  float32 grid, little-endian, BIL band order) + `.tif`.
- Decoded and verified: grid is 185 cols x 180 rows, 0.1 degree, bbox
  (-134,30)-(-115.5,48), WGS84. 33,300 floats total, 15,270 non-nodata
  cells, values in [0.0156, 0.9715] = blue whale presence probability from
  the ensemble model. **The `.grd` header's `nodatavalue=-3.4e+38` is not
  what the `.gri` binary actually contains** — the 18,030 missing cells are
  encoded as IEEE `NaN`, not that sentinel (verified against the checked-in
  fixture with a byte-level decode: zero cells equal `<= -3.4e38`, 18,030
  are `NaN`). A decoder written to filter `value <= -3.4e38` would pass
  every `NaN` straight through — in JS/TS, any comparison against `NaN` is
  `false`. **The decoder must test `Number.isFinite(value)` (or
  `!Number.isNaN(value)`), never compare against the header's stated
  sentinel.**
- **No `_latest` alias exists** — `blwh_ensemble_latest.*` returns the site's
  HTML SPA shell (200, but not raster data). The current file must be found
  by reading the manifest and taking the newest date.
- No CORS header on `oceanview.pfeg.noaa.gov` — must be proxied by our API,
  which is the real reason the project needs a backend at all.
- Model is **blue whale only**. Attribution: Abrahms et al. 2019, *Diversity
  & Distributions*, doi:10.1111/ddi.12940. The project states it "is solely
  the responsibility of the WhaleWatch 2.0 project and is not associated
  with NOAA CoastWatch" — both must appear in the credits panel.

### OBIS-SEAMAP's own WFS/GeoServer is unreachable; the "research vs.
citizen" split does not hold across GBIF vs. OBIS

- `seamap.env.duke.edu/geoserver/{wfs,ows,obis_seamap/wfs}` all return
  HTTP 404. The spec's assumption of a working OGC WFS was wrong.
- `api.obis.org/v3/occurrence` works, but pulling records from it does not
  give a clean research/citizen split: an OBIS query for gray whales
  returned an iNaturalist observation (`institutionCode: iNaturalist`,
  `basisOfRecord: HumanObservation`) — i.e. citizen-science data is *inside*
  OBIS, not separate from it.
- Symmetrically, a GBIF query for humpback whales returned a Happywhale
  research record — i.e. research data is *inside* GBIF too.
- The two APIs' identifiers don't cross-match for deduplication: the same
  Happywhale record has `occurrenceID=636969` via GBIF vs. `occurrenceID=
  575800` via OBIS (bare integers, not shared), and GBIF's `datasetKey` is
  not the same identifier space as OBIS's `dataset_id`. A spatiotemporal
  fallback key (species + rounded lat/lon + timestamp) also produces false
  merges (two distinct Happywhale encounters share a rounded coordinate and
  timestamp).
- GBIF already republishes OBIS-SEAMAP's contributing datasets: faceting
  GBIF's blue-whale records in the CA bbox by `publishingOrg` gives
  OBIS-SEAMAP 8,547 of 12,049 records (71%), NOAA IOOS 2,656, iNaturalist
  773. Dropping the direct OBIS API call therefore loses very little
  coverage and removes an entire dedup subsystem that would otherwise be
  needed to avoid double-counting the same sightings from two APIs.

### GBIF alone is stale for "recent" data

- GBIF, CA bbox, all four target species: 0 records in the last 7 days, 0
  today, on the date verified. Last 30 days: humpback 69, blue 3, gray 2,
  orca 1. The aggregation pipeline into GBIF lags 2-6 weeks.
- iNaturalist's own API (`api.inaturalist.org/v1/observations`), queried
  directly rather than through GBIF's mirror, returned 36 humpback
  observations in the same 7-day window GBIF returned 0 for. Keyless,
  `Access-Control-Allow-Origin: *`.

### Other findings folded into design

- `datasetKey=b3fc1d76-a50d-4a57-a2f3-425adfc59f9f` (SanctSound, hydrophone
  network) contributes 12,504 records in the CA bbox concentrated on ~8
  fixed buoy coordinates, all `basisOfRecord=MACHINE_OBSERVATION`. Rendered
  as sighting pins or fed into a density calculation, these read as false
  hotspots at the buoy locations. Excluded from both.
- License facet on GBIF blue-whale CA records: `CC_BY_NC_4_0` 7,736 of
  12,049 (64%). Per-record license must be stored and surfaced; see
  ADR 0003.
- Records span back to the 1970s (Cascadia's dataset alone: 1990s 3,571,
  2000s 2,562, 2010s 1,913, 2020s 3,103 in just the blue-whale slice). An
  all-time default would present decades-old survey tracklines as current
  sightings; the sightings layer must never default to all-time. The exact
  default window is set in [ADR 0003](0003-licensing-and-time-defaults.md)
  (30 days, with 12 months available as an explicit, non-default option).
- Gray whales are seasonally absent from California (they migrate through,
  not resident) — an empty gray-whale layer outside the migration window is
  correct behavior, not missing data, and needs a UI note saying so.

## Decision

- **Layer 1 (probability):** check the real WhaleWatch 2.0 raster manifest
  for a new date, proxy and decode `.grd`/`.gri` server-side, serve as
  GeoJSON, stamped with the model's own date. Blue whale only.
  **Implementation note (added R1):** this is a lazy, request-triggered
  refresh (`packages/api/src/store/ttlCache.ts`, 6h TTL) — the first
  request after the TTL expires pays for the refresh, there is no
  standalone background poller. For a model that itself refreshes at most
  daily and a low-traffic app, this is simpler than a scheduler with an
  identical practical refresh cadence (worst case, one request is served
  the same grid a scheduler would have refreshed moments earlier). The
  original "poll... daily" wording above described an active job that was
  never built; revisit toward one only if traffic patterns ever make the
  request-triggered refresh's latency (one slow request pays for the
  NOAA fetch) an actual user-facing problem.
- **Layer 2 (research-grade sightings):** GBIF only. Tier by
  `publishingOrgKey`, not by which API answered and not by `basisOfRecord`
  (SanctSound is machine-observed but authoritative; Cascadia/OBIS-SEAMAP
  data via GBIF is human-observed research data). Exclude the SanctSound
  `datasetKey` from pins. Default view: never all-time — see ADR 0003 for
  the exact window.
- **Layer 3 (citizen reports):** iNaturalist's direct API for the recent
  window (the only source with data inside 7-30 days) plus GBIF's
  iNaturalist-sourced dataset for historical depth, de-duplicated against
  each other (not against GBIF's research records — different problem,
  same API, real overlap only between these two iNat-sourced pulls).
  `quality_grade` splits verified (`research`) from unverified (`needs_id`)
  citizen records; obscured/geoprivacy coordinates are never rendered as
  precise pins.
- **OBIS-SEAMAP's own API is dropped from v1.** Its data reaches Spout
  through GBIF instead.

## Consequences

- No dedup subsystem needed across GBIF/OBIS — one less deep module, one
  less category of correctness bug.
- The "confirmed research vs. unverified citizen" trust split in the UI is
  now accurate (tiered by publisher, not by which API answered), whereas
  the spec's original OBIS-vs-GBIF split was not.
- Losing OBIS's direct API costs roughly 24% of historical OBIS-SEAMAP-only
  coverage that GBIF's mirror doesn't carry — acceptable, revisit if a
  future round shows real coverage gaps.
- The probability layer is a genuine NOAA model, not project-authored
  extrapolation, and is limited to blue whales only — this must be visible
  in the UI, not just in this document.
