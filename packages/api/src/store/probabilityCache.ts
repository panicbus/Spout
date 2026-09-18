import type { ProbabilityGrid } from "@spout/contracts";
import { TtlCache } from "./ttlCache.js";

/**
 * There is exactly one probability grid at a time — no rows to query by
 * bbox/species like the sightings store planned for R2 — so a generic
 * `TtlCache` (stale-on-failure, in-flight de-duped) is the right shape,
 * not SQLite. See `ttlCache.ts` for the actual behavior; this is just a
 * named specialization so call sites read `ProbabilityCache`.
 */
export class ProbabilityCache extends TtlCache<ProbabilityGrid> {}
