# 0001: Backend is Hono + TypeScript, not Rust + Axum

## Status

Accepted (2026-09-18)

## Context

`docs/spec.md` specifies a Rust/Axum backend, reasoning that it "gives Rust a
meaningful role" and keeps three heterogeneous upstream formats behind one
normalized contract.

Before building, the following was verified on the dev machine and against
the actual workload:

- `cargo`, `rustc`, `rustup` are **not installed**. `node v24.21.0`, `npm
  11.19.0`, `flyctl 0.4.29` are.
- The backend's entire job is: fetch JSON/binary from three keyless HTTP
  APIs, decode one ~133KB float32 raster, normalize into a shared shape,
  cache in SQLite, serve JSON. There is no CPU-bound work and no concurrency
  pressure that would benefit from Rust's performance model.
- Rust costs: a rustup install, 20–60s incremental rebuilds on every
  red-green TDD cycle (the project is required to be TDD throughout), `sqlx`
  needing a live database at build time for its compile-time query macros,
  and a hand-written multi-stage Dockerfile for Fly.io (vs. `fly launch`
  autodetecting Node).
- Sharing the `Sighting` type with the frontend would need `ts-rs` or
  `typeshare` codegen (only emitted when `cargo test` runs) instead of a
  plain TypeScript import.

## Decision

Backend is **Hono on Node 24 + TypeScript**, using `better-sqlite3` for the
cache/store and `zod` for both runtime validation and the source-of-truth
type definitions (see `packages/contracts`). One language, one test runner
(Vitest), one `node_modules` across the whole monorepo.

## Consequences

- Faster TDD iteration loop; no separate toolchain to install or maintain.
- Types are shared by import (`@spout/contracts`), not generated.
- `fly launch` can autodetect the Node app; no hand-written Dockerfile
  toolchain split between two languages.
- The API runs via `tsx` (`npm run start` → `tsx src/server.ts`) in
  production the same way it does in dev, rather than compiling to a
  separate `dist/`. A compiled build would hit the standard monorepo
  dual-package hazard (`@spout/contracts`'s `package.json` points `main`
  at TypeScript source for dev-time tooling to transpile; a plain `node
  dist/server.js` can't resolve that without its own loader). Running
  everything through `tsx` sidesteps it entirely and keeps the "avoid
  toolchain overhead" reasoning above consistent through to deployment.
  Revisit if profiling ever shows `tsx`'s startup cost matters.
- Rust's memory-safety and performance advantages are not needed here and
  are given up. If a future phase adds CPU-bound work (e.g. large-scale
  raster processing beyond a single daily grid), the REST contract in
  `packages/contracts` is kept clean enough that only `packages/api`'s
  implementation would need to be replaced — the frontend would not change.
