import { z } from "zod";

/**
 * The one schema shared across all three packages this early: `packages/api`
 * validates its `/health` response against it, `packages/web` validates the
 * fetched response against the same schema before trusting it. Small on
 * purpose — its only job in R0 is to prove the shared-type wiring described
 * in ADR 0001 ("types are shared by import, not generated") actually holds
 * end to end, browser to Node, not just asserted in the ADR's prose.
 */
export const HealthStatusSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
