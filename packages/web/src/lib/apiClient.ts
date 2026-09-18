import { HealthStatusSchema, type HealthStatus } from "@spout/contracts";

/**
 * Overridable via `VITE_API_URL` for non-local environments; defaults to
 * the local `packages/api` dev server.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787";

/**
 * The one function in the app that fetches `/health`. Small today —
 * proves the shared-schema wiring from ADR 0001 actually holds (the same
 * `HealthStatusSchema` validates the response here that `packages/api`
 * validates it against before sending) — and is where every future
 * `sources/*` fetch on the frontend side would follow the same shape:
 * fetch, then `Schema.parse`, never trust an unvalidated response.
 */
export async function fetchHealth(baseUrl: string = API_BASE_URL): Promise<HealthStatus> {
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error(`GET ${baseUrl}/health failed with status ${response.status}`);
  }
  return HealthStatusSchema.parse(await response.json());
}
