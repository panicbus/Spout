# WhaleWatch 2.0 raster fixture

`blwh_ensemble_2026-09-15.{grd,gri}` is a **frozen, one-time snapshot**,
downloaded and verified during initial data-source validation (see ADR
0002). It is not refreshed automatically and nothing should add a new
dated pair to this directory each round — that would grow the repo by
~135KB per commit forever for no test benefit.

- `.grd`: plain-text INI georeference header (grid shape, bbox, nodata
  value as *documented by the source* — see the caveat below).
- `.gri`: the raw grid, 33,300 little-endian float32s, BIL band order.

Its only consumer (once R1's raster decoder exists) is as a real-data
fixture: decode it and assert the known values — 180x185 grid, 15,270
finite cells, min 0.015597930178046227, max 0.9714617729187012.

**Known trap, verified by decoding this exact file:** the `.grd` header
says `nodatavalue=-3.4e+38`, but the `.gri` binary actually encodes its
18,030 missing cells as IEEE `NaN`, not that sentinel. A decoder that
filters `value <= -3.4e38` will pass every `NaN` straight through (any
comparison against `NaN` is `false` in JS). Decode nodata with
`Number.isFinite(value)`, not a comparison against the header's stated
value. See ADR 0002 for the full writeup.

If a later round needs a second date (e.g. to test "yesterday vs. today"
manifest-polling logic), add it deliberately and update this note — don't
let fixtures accumulate silently.
