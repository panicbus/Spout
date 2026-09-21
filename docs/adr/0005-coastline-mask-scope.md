# 0005: The coastline mask trims land, not bays — and both have a real resolution ceiling

## Status

Accepted (2026-09-21)

## Context

Real usage of the app (a user screenshot, 2026-09-21) showed the
probability layer still visibly covering what looks like non-ocean area
in two different places near San Francisco Bay:

1. Color filling San Pablo Bay well past Richmond, up toward Vallejo.
2. An orange patch over inland hills near Santa Rosa/Petaluma.

Both look like the same bug at a glance, but they have different causes,
and only one of them is fixable by "improving the mask."

**`getLandMask`/`rasterizeLandMask` (`packages/api/src/raster/
coastlineMask.ts`, `landMask.ts`) only ever classified land vs.
not-land.** The source polygon is `world-atlas`'s `land-10m.json`
(Natural Earth, 1:10,000,000 scale) — a *land* dataset, not an *ocean*
dataset. San Francisco Bay, San Pablo Bay, and the Delta are real water
bodies in that polygon, so they were never masked out. This was never
actually decided one way or the other when the coastline mask was built
(`602744e`, `1fe5875`) — the mask's scope was implicitly "whatever
`land-10m.json` calls land," and nobody at the time asked whether bays
should count as land for this product's purposes. That's the gap this
ADR closes: it wasn't a decision, and it should have been one.

The second issue — the inland-looking blob — is not a scope question at
all. Two resolution ceilings compound regardless of the mask's scope:

- WhaleWatch 2.0's own grid is ~0.1°/~11km per cell (ADR 0002). A single
  coastal cell's footprint can span real terrain that looks, at the
  rendered zoom level, like it's plainly on land.
- `land-10m.json` is itself a *generalized* 1:10,000,000-scale vector —
  the finest tier Natural Earth/`world-atlas` offers. Narrow inlets,
  sloughs, and marshy coastal indentations (exactly what the Santa
  Rosa/Petaluma/San Pablo Bay margin looks like) get simplified in the
  source data itself. `SUPERSAMPLE_FACTOR = 6` sharpens the
  *rasterization* of that polygon — it cannot add vertex precision the
  polygon never had. `coastlineMask.test.ts` cross-validates the
  rasterizer against `@turf/boolean-point-in-polygon` at ~550 points with
  100% agreement, confirming the algorithm faithfully reproduces
  `land-10m.json`'s own boundary — the boundary itself is just coarse
  there.

## Decision

**Bays and other inland water stay unmasked (real presence-probability
values render there) — this is a deliberate scope decision, not a
known bug left open.** Reasoning: whether the model's own output should
even have non-nodata values over bay water is a question about NOAA's
upstream WhaleWatch 2.0 model, not something a downstream land/water mask
should silently decide. Introducing an ocean-only boundary here would be
answering a modeling question with a rendering hack. If bays need
suppressing later, that's a new, explicit decision (an ocean polygon or
an explicit bay-exclusion zone) — not a fix to the existing land mask.

**The inland-terrain-footprint blockiness is accepted as a real limit of
the current data (~11km model cells + 1:10M coastline vector), not
something the mask algorithm itself can improve further.** A visibly
tighter coastline would require a higher-resolution coastline source
(e.g. a 1:1M or finer vector) — a real, but currently out-of-scope,
follow-up.

A short explanatory legend (`ProbabilityLegend`, in `ProbabilityLayer`)
was added alongside this ADR so the layer's colors are self-explanatory
in the UI, separately from this written record of what the mask does and
doesn't cover.

## Consequences

- A user (or a future contributor) seeing color over SF/San Pablo Bay is
  not a mask regression — this ADR is the reference for why.
- If a higher-resolution coastline source is ever adopted, re-verify
  `coastlineMask.test.ts`'s cross-validation still holds and re-measure
  `loadClippedLandFeatures`'s cold-load cost (currently 70-110ms against
  `land-10m.json`'s 2.9MB) against the new source's file size.
- An explicit ocean/bay boundary remains a real, separate feature if the
  product ever wants bay water suppressed — not implied or partially
  done by anything currently in `coastlineMask.ts`.
