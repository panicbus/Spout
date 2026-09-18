# Spout

A mobile-first map of blue whale presence probability and recent research /
citizen sightings along the California coast. See [`docs/spec.md`](docs/spec.md)
for the original product spec and [`docs/adr/`](docs/adr/) for where and why
the build departs from it — those decisions were made from live verification
of every data source, not assumption.

## Structure

npm workspaces monorepo. Each package is a small, single-purpose module —
this keeps any one change (or any one agent's context) scoped to one folder.

```
packages/
  contracts/   zod schemas — the one definition of Sighting, ProbabilityGrid, etc.
               Both api and web import this; a schema change breaks both builds.
  api/         Hono + TypeScript backend. Fetches/normalizes/caches the three
               upstream sources, serves one clean JSON API.
  web/         React + TypeScript + Vite + MapLibre GL JS PWA.
docs/
  spec.md      original product spec
  adr/         decision records, especially where the spec's assumptions
               turned out to be wrong once the data sources were verified
fixtures/      recorded real upstream responses, shared by both test suites
               so backend and frontend fixtures can't drift apart
```

## Requirements

- Node 24+, npm 11+ (no other runtime — see [ADR 0001](docs/adr/0001-backend-hono-not-rust.md)
  for why this isn't Rust)
- No API keys for local development. NOAA WhaleWatch, GBIF, iNaturalist, and
  the OpenFreeMap tile source are all free and keyless.

## Getting started

```bash
npm install
npm run dev:api    # http://localhost:8787
npm run dev:web    # http://localhost:5173
```

## Testing

TDD throughout — see [`mattpocock-skills:tdd`](https://github.com/mattpocock/skills)
for the workflow this repo follows. Every package:

```bash
npm test           # vitest, all packages
npm run typecheck  # tsc --noEmit, all packages
```

`packages/web` additionally has a Playwright suite exercising the real map in
a real browser (MapLibre cannot render in jsdom — see
`packages/web/src/test/maplibre-mock.ts` for the unit-test approach):

```bash
cd packages/web
npx playwright install chromium   # first time only
npm run test:e2e
```

## Agents

- **`.claude/agents/antagonist.md`** — a standing adversarial reviewer,
  invoked at every build waypoint and whenever a technical decision needs a
  second opinion instead of a stop-and-ask. Its findings are adopted, not
  merely considered; see ADR 0002 for an example of what it caught.
