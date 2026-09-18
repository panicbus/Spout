import { HealthStatusSchema } from "@spout/contracts";
import { Hono } from "hono";

/**
 * Deep-module note: this is deliberately the one shallow route in the
 * API — it exists only so Fly.io healthchecks and local `curl` have
 * something to poll. Every other route in `routes/` composes a real
 * module from `sources/`, `normalize/`, or `store/`.
 *
 * Validated against `HealthStatusSchema` before it's sent, not just typed
 * against it — the same schema `packages/web` validates the response
 * against on the way in, so a shape mismatch fails loudly on whichever
 * side changed first instead of silently at the other end.
 */
export const healthRoute = new Hono().get("/health", (c) =>
  c.json(HealthStatusSchema.parse({ status: "ok", timestamp: new Date().toISOString() })),
);
