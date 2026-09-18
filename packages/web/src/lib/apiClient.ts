import { HealthStatusSchema, ProbabilityGridSchema, type HealthStatus, type ProbabilityGrid } from "@spout/contracts";
import type { ZodType } from "zod";

/**
 * Overridable via `VITE_API_URL` for non-local environments; defaults to
 * the local `packages/api` dev server.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787";

/**
 * Fetch `path` and validate the JSON body against `schema` before
 * trusting it — every endpoint call in this file follows this exact
 * shape, so it's written once here instead of once per function.
 */
async function fetchAndValidate<T>(path: string, schema: ZodType<T>, baseUrl: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${baseUrl}${path} failed with status ${response.status}`);
  }
  return schema.parse(await response.json());
}

/**
 * Proves the shared-schema wiring from ADR 0001 actually holds (the same
 * `HealthStatusSchema` validates the response here that `packages/api`
 * validates it against before sending).
 */
export function fetchHealth(baseUrl: string = API_BASE_URL): Promise<HealthStatus> {
  return fetchAndValidate("/health", HealthStatusSchema, baseUrl);
}

/** Fetches the current WhaleWatch 2.0 probability grid (see ADR 0002, R1). */
export function fetchProbabilityGrid(baseUrl: string = API_BASE_URL): Promise<ProbabilityGrid> {
  return fetchAndValidate("/api/probability", ProbabilityGridSchema, baseUrl);
}
