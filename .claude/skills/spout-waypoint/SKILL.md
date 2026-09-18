---
name: spout-waypoint
description: End-of-round ritual for the Spout project — full verification sweep, /code-review, an antagonist pass, fixing every real finding, and a real commit. Use at the end of every Spout build round (R0, R1, R2, ...) before considering it done, and any time a meaningful chunk of Spout work needs to land safely.
---

# Spout waypoint

Ran twice already (R0, R1), identically both times, each time surfacing
real bugs neither pass alone would have caught. This is that ritual,
written down so it runs the same way every round instead of being
re-derived from memory.

**The whole point is that nothing gets skipped under time pressure.**
Every step below has already prevented a real bug from shipping at least
once.

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

## 3. Run both review passes — in parallel, in one message

- `Skill({ skill: "code-review", args: "--level medium" })`
- `Agent({ subagent_type: "antagonist", run_in_background: true, ... })`
  — give it a full, specific brief: what was built this round (file by
  file, not just a feature name), what decisions were already settled
  and shouldn't be re-litigated (point at the relevant ADRs), and 4-8
  concrete things to specifically pressure-test given what's novel about
  this round's code. A vague "review this" prompt gets a vague review.

If `subagent_type: "antagonist"` isn't in the available list yet this
session (it's a project agent, only picked up after the first time this
session sees `.claude/agents/antagonist.md`), fall back to
`subagent_type: "general-purpose"` with the antagonist's persona
instructions pasted into the prompt directly. It'll be available as a
real type on the next invocation.

While the antagonist runs in the background, do NOT keep editing the
files it's reviewing — R1's antagonist lost time to a stale read because
staging kept moving underneath it mid-review. Either wait, or work on
something in a completely disjoint part of the tree.

## 4. Fix every real finding from both passes

Not a subset. For each finding:

- **Verify it, don't just trust the prose**, especially factual/numeric
  claims — curl the real endpoint, re-decode the real fixture, or run a
  quick script to check a number before accepting it. Both review passes
  have been right almost every time, but not always (R1's antagonist
  flagged files as unstaged that were actually already staged — a timing
  artifact of reviewing mid-edit, not a real bug). Independent verification
  is cheap; take it.
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

Re-run the full verification sweep from step 1 after fixing — every time,
not just once at the end. Fixes have their own bugs.

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
