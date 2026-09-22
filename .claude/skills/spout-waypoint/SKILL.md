---
name: spout-waypoint
description: Lightweight round-end checkpoint for the Spout project — commit real progress so it isn't lost, without a full verification/review gate on every round. Use at the end of a Spout build round.
---

# Spout waypoint

**Revised again after the R4-era process ran far too hot on tokens and
time** — full review (even the "lightweight" two-pass version) plus a full
verification sweep on every single round meant process cost dwarfed
implementation cost. The fix isn't a cheaper review — it's not reviewing
every round at all.

## What a waypoint actually is now

A checkpoint commit. Its only job is to stop you from having to redo a large
chunk of work if something later goes wrong — not to certify the code is
correct. That certification happens once, at the very end of a whole feature
(see the plan's "Verification" section), not at every waypoint along the way.

## Steps

1. **A targeted check, scoped to what actually changed** — not the full
   workspace sweep. If you touched `packages/api/src/sources/foo.ts`, run
   `npx tsc --noEmit` in that package and the specific test file(s) for that
   change, not `npm run typecheck`/`npm run test` at the root. The point is
   catching an obvious break in what you just wrote, not re-verifying the
   whole repo.
2. **A real TDD test for new logic** — if this round added real logic (not
   config, not wiring), it should have a failing-first test proving it,
   scoped to that logic. Don't add tests for wiring, glue, or anything the
   typechecker already guarantees.
3. **Stage and commit.** `git add -A`, one commit, message states what was
   built and any real decision made along the way. No review pass, no full
   sweep, no e2e run — those happen once, at the end of the feature.

## Stay compartmentalized

Touch only the files the current task actually names. If making a change
seems to require touching something outside that set, stop and say so rather
than expanding scope on your own — a "while I'm in here" edit is exactly the
kind of scope creep that turns a small round into a large, slow one.

## What moved to end-of-feature instead of every round

- Full sweep: `npm run typecheck && npm run lint && npm run test --workspaces`, `npm run build -w @spout/web`, e2e.
- One review pass (single agent, or `review-pass-nico` for something
  genuinely high-stakes — a new dependency, a data-correctness rewrite).
  Not per round.
- Project-memory updates — batch these at the end too, not per waypoint.
