---
name: spout-waypoint
description: End-of-round ritual for the Spout project — full verification sweep, a lightweight concurrent review pass, fixing every real finding, and a real commit. Use at the end of every Spout build round (R0, R1, R2, ...) before considering it done, and any time a meaningful chunk of Spout work needs to land safely.
---

# Spout waypoint

Ran through R0-R4a, each time surfacing real bugs neither review pass alone
would have caught. This is that ritual, written down so it runs the same way
every round instead of being re-derived from memory.

**The whole point is that nothing gets skipped under time pressure.**
Every step below has already prevented a real bug from shipping at least
once.

**Revised after R4a** (see `spout-antagonist-workflow.md` memory for the full
reasoning): R4a's review step alone — a 10-agent `/code-review` fan-out plus a
separate antagonist — burned over 1.3M tokens for one round, dwarfing the
actual implementation work. Steps 3 and 4 below now reflect the lighter
process adopted after that: `/review-pass-nico` (two concurrent single-pass
reviewers, not a many-agent fan-out) is the default; the full heavy combo
(`/code-review` + a dedicated antagonist) is reserved for genuinely high-stakes
rounds (a new dependency, a data-correctness-critical rewrite, something this
project can't easily re-verify live). Round-splitting "for reviewability"
(R4a/R4b) is also retired as a default — one waypoint per round unless a round
is unusually large, since the review step's cost is closer to a fixed
per-waypoint overhead than a diff-size-proportional one.

**Revised after R4b:** cutting the fan-out (R4a's fix) wasn't enough on its
own — with two lighter passes in place, the new dominant cost became the
*orchestrator* (you) independently re-reading nearly every file both passes
had already read, to re-verify findings they'd already verified. That's real
protection for the cases it catches, but doing it for every finding regardless
of type made the "cheap" review nearly as expensive as the fan-out it
replaced. Step 3 now has three tiers instead of two — most rounds don't need
`review-pass-nico`'s full two-pass treatment — and step 4's verification
bullet now scopes *what* gets independently re-checked instead of defaulting
to "everything."

## 0. Before fully building an uncertain technical bet, measure it first

If a round's approach rests on a claim you're not actually sure of yet (will
this interpolation technique look good enough, will this query be fast
enough, does this library actually support what the docs imply), write the
smallest possible script or snippet to check that claim against real data
BEFORE building the full tested implementation around it. R4a built, tested,
and wired a complete CPU-interpolation approach for smoothing the probability
layer before measuring that it only helped ~14% of the time — the measurement
script that settled it was 15 lines and could have come first. Not every
round has one of these; most don't. When one does, the cheap check goes
before the real build, not after.

## 1. Full local verification, before either review pass

```bash
npm run typecheck   # --workspaces, all three packages
npm run lint         # eslint . at the root
npm run test         # --workspaces, all three packages
```

Then, from `packages/web`: `npm run build` (catches build-time issues
`tsc --noEmit` alone doesn't) and `npm run test:e2e` (real browser, real
MapLibre — unit tests mock both). Clean up `dist/` afterward.

If anything in this round touches a live network path (a new source, a
new endpoint), do one real smoke test against the actual upstream — start
the dev servers, hit the real API, and if it's a rendered map layer,
**fetch the upstream's own reference rendering if one exists and compare
visually** before trusting a screenshot in isolation. (R1's `heatmap`
layer looked plausible alone; it was flatly wrong, caught only by
checking it against NOAA's own map image.) Stop the dev servers and
delete any scratch screenshots/build output afterward.

Do not proceed to review with anything red here.

## 2. Stage everything

`git add -A`, then `git status --short` to see the real diff surface both
review passes will work from.

## 3. Run the review pass

Three tiers — pick the cheapest one that actually fits the round, don't
default to the middle tier out of habit:

- **Tier 1 — single pass (small/routine round).** A handful of files, no new
  architectural pattern, no data-correctness or user-honesty surface, mostly
  following a pattern already established elsewhere in this codebase (e.g. a
  fourth `useFetch`-backed hook, another entry in an existing registry/map,
  a small bugfix contained to one file). One `Agent({ subagent_type:
  "general-purpose", ... })` call, briefed the same specific way as below
  (file-by-file, settled decisions flagged, concrete things to pressure-test)
  — just one reviewer instead of two. If it turns up nothing, you're done
  with review; if it turns up something that smells architectural or
  data-correctness-shaped, escalate to Tier 2 rather than patching narrowly.
- **Tier 2 — `review-pass-nico` (default for a normal round).** Two
  concurrent single-pass reviewers (quality checklist + adversarial), not a
  many-agent fan-out. Use this whenever a round adds new UI surface a real
  user will interact with, a new hook/architecture pattern, anything
  touching accessibility, or anything touching what gets rendered/claimed
  about data honesty (a citation, a precision figure, a license) — R4b was
  this tier and it caught real bugs in exactly those categories.
- **Tier 3 — heavy combo (high-stakes only).** `Skill({ skill:
  "code-review", args: "--level medium" })` in parallel with `Agent({
  subagent_type: "antagonist", run_in_background: true, ... })`. Reserve for
  a new dependency, a data-correctness-critical rewrite, or something this
  project can't cheaply re-verify against live data. If `subagent_type:
  "antagonist"` isn't in the available list yet this session, fall back to
  `subagent_type: "general-purpose"` with the antagonist's persona
  instructions (`.claude/agents/antagonist.md`) pasted into the prompt
  directly.

Whichever tier, give the reviewer(s) the Spout-specific context a generic
skill invocation can't know on its own: what was built this round (file by
file, not just a feature name), what decisions were already settled and
shouldn't be re-litigated (point at the relevant ADRs), and 4-8 concrete
things to specifically pressure-test given what's novel about this round's
code. A vague "review this" prompt gets a vague review regardless of which
tier runs it.

While a review pass runs in the background, do NOT keep editing the files
it's reviewing — R1's antagonist lost time to a stale read because staging
kept moving underneath it mid-review. Either wait, or work on something in
a completely disjoint part of the tree.

## 4. Fix every real finding from the pass(es)

Not a subset. But *re-verifying* every finding yourself before fixing it is
not the default either — that became R4b's real cost, not the review passes
themselves. Scope re-verification by what kind of finding it is:

- **`PLAUSIBLE`-marked findings** — always independently verify before
  deciding whether to fix. The pass itself said its reasoning wasn't fully
  traced.
- **A `CONFIRMED` finding that rests on a factual/numeric/external claim**
  (a library's real behavior, a citation, a measured number, what an ADR
  actually says) — always independently verify. This is genuinely cheap
  (curl the endpoint, grep the ADR, check the library source) and has caught
  real errors before (R1's antagonist flagged files as unstaged that were
  actually already staged — a timing artifact of reviewing mid-edit).
- **A `CONFIRMED` finding that's a traced code-logic bug** (a stale closure,
  a missed edge case, a race) **with a clear failure scenario already
  spelled out** — read the cited lines to confirm the finding's premise is
  real (the file/lines it points at actually say what it claims), then trust
  the trace and fix it. Re-deriving the entire call chain yourself from
  scratch, when the pass already did that and showed its work, is the
  redundant step to cut. If two passes independently converged on the same
  finding, that convergence is itself a form of verification — trust it more,
  not less.
- **If a fix changes behavior, prove it red-then-green** — temporarily
  revert the fix, confirm the new/existing test actually fails, restore
  it. A test added after the fix with no red phase hasn't proven anything.
- **If a finding reveals an ADR or doc that now disagrees with what got
  built** (R1: ADR 0002 said "poll daily," the code shipped lazy
  refresh-on-request), amend the ADR to record the real decision and
  reasoning — don't leave code and docs contradicting each other.
- **If the same small object/fixture/helper has been hand-copied across
  3+ files**, this is the DRY signal to extract it once (R1: 6 duplicated
  `ProbabilityGrid` test fixtures consolidated into
  `@spout/contracts/fixtures.js`) rather than leaving each copy to drift.

After each individual fix: prove it red-then-green (above) and run a
**targeted** check, scoped to literally just what changed — e.g.
`npx vitest run <path/to/the/one/test/file>`, `npx eslint <path/to/the/one/
file>`, `npx tsc --noEmit` only if the fix touched types shared across files.
Not `npm run lint`/`npm run test` at the workspace root — those re-check
every file in every package regardless of what changed, which is exactly the
repeated-full-sweep cost this step exists to avoid (R4b ran the full
root-wide lint 3 times in one waypoint chasing fixes that only ever touched
1-2 files each). Re-run the **full** sweep from step 1 (typecheck, lint,
every test, build, e2e) **once**, after every finding from this round is
fixed, right before committing — not after each individual fix. The targeted
check already catches a fix's own bugs; the full sweep's job is to catch
cross-cutting breakage (a rename that missed a call site elsewhere, a shared
hook two features both use), which only needs checking once all fixes have
landed, not after every single one.

## 5. Commit

One commit for the round. The message states what was built (module by
module, not just the feature name), the real decisions/tradeoffs made
along the way, and — explicitly — what both review passes found and how
each finding was resolved. Future sessions (including future antagonist
runs) read this history; a commit message that only says "add feature X"
throws away the reasoning that took the most effort to produce.

## 6. Update project memory

Edit `spout-project.md` in this project's memory directory: bump the
round-status line, add any newly-reusable infrastructure (a generic
cache, a shared hook, a fixture builder) so the next round reaches for it
instead of rebuilding it, and record any trap or lesson worth a future
session not re-discovering the hard way.
