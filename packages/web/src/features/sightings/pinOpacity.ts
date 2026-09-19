import type { AgeBucket } from "../../lib/ageBucket.js";

/**
 * Opacity multiplier by `ageBucket` (`lib/ageBucket.ts`) — a pin fades as
 * it gets older, so the map itself communicates recency without requiring
 * a tap into `PinDetailCard`. Split into its own module (not defined
 * inline in `SightingsLayer.tsx`) so these constants — and their
 * crossover-safety invariant — can be imported by tests without breaking
 * React Fast Refresh's one-component-per-file assumption for the layer
 * component itself.
 */
export const AGE_OPACITY: Record<AgeBucket, number> = {
  today: 1,
  "this-week": 0.85,
  "this-month": 0.65,
  older: 0.5,
};

/**
 * The verification/age opacity split — see `SightingsLayer.tsx`'s
 * `pointsLayer.paint["circle-opacity"]` for how these combine.
 * `VERIFIED_MIN_OPACITY` exists because naively multiplying age fade into
 * verification fade (an earlier draft of this round did exactly that)
 * compresses the gap between "old but verified" (0.85 × 0.5 = 0.425) and
 * "new but unverified" (0.4 × 1 = 0.4) down to 0.025 — a 6% relative
 * difference, well under any real perceptual threshold, silently
 * undermining the one invariant this layer exists to protect
 * (spec.md/ADR 0002: an unverified citizen report must read as visually
 * distinct from confirmed data). Flooring verified opacity regardless of
 * age keeps a guaranteed, perceptible gap between the two categories no
 * matter how old a verified sighting is.
 */
export const UNVERIFIED_OPACITY = 0.4;
export const VERIFIED_OPACITY = 0.85;
export const VERIFIED_MIN_OPACITY = 0.6;
