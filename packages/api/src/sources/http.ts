const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 4;

function defaultDelayMs(attempt: number, retryAfterSeconds: number | undefined): number {
  if (retryAfterSeconds !== undefined) return retryAfterSeconds * 1000;
  // Exponential backoff with a little jitter: attempt 1 -> ~1s, 2 -> ~2s, 3 -> ~4s...
  return 2 ** (attempt - 1) * 1000 + Math.random() * 250;
}

/**
 * `Retry-After` may be a plain integer number of seconds (what GBIF's
 * Varnish layer sends) or, per RFC 9110, an HTTP-date string. This only
 * handles the seconds form; a date-form header is treated as absent
 * (falls back to exponential backoff) rather than misparsed —
 * `Number("Wed, 21 Oct 2026 ...")` is `NaN`, and `NaN` is not `=== undefined`,
 * so an unguarded caller would pass `NaN` through as if it were a real
 * delay, and `setTimeout(fn, NaN)` fires on the next tick — retrying
 * immediately in a tight loop, the opposite of backing off.
 */
function parseRetryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isNaN(seconds) ? undefined : seconds;
}

export interface FetchWithBackoffOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  /** Overridable for tests, so retries don't actually wait. Called with the 1-based attempt number and the response's Retry-After header (seconds), if any. */
  delayMs?: (attempt: number, retryAfterSeconds: number | undefined) => number;
}

/**
 * A `fetch` wrapper shared by every rate-limited upstream source (GBIF
 * today, iNaturalist in R3) — one retry policy, not one per source.
 * Retries on 429 and 5xx (transient) AND on the fetch call itself
 * rejecting (DNS failure, connection reset, aborted request — all
 * transient network conditions, not just transient HTTP statuses); never
 * retries a non-429 4xx (a genuinely malformed request won't fix itself).
 * Honors `Retry-After` when the upstream sends one (GBIF's Varnish layer
 * does under load) instead of guessing a delay.
 */
export async function fetchWithBackoff(
  url: string,
  options: FetchWithBackoffOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const delayMs = options.delayMs ?? defaultDelayMs;

  let attempt = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetchImpl(url);
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs(attempt, undefined)));
      continue;
    }

    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= maxRetries) {
      return response;
    }

    attempt += 1;
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("Retry-After"));
    await new Promise((resolve) => setTimeout(resolve, delayMs(attempt, retryAfterSeconds)));
  }
}
