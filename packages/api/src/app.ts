import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoute } from "./routes/health.js";

/**
 * Builds the Hono app without binding it to a port. Kept separate from
 * `server.ts` so tests call routes in-process via `app.request()` —
 * no socket, no port collisions, no server lifecycle to manage in tests.
 */
export function createApp() {
  const app = new Hono();
  // Every route this API serves is public, read-only, keyless whale data
  // (see docs/spec.md) — there's no session/cookie to protect, so an
  // open CORS policy is the correct one, not just the convenient one.
  app.use("*", cors());
  app.route("/", healthRoute);
  return app;
}
