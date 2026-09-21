import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, type RefObject } from "react";

const MARGIN = 16;
/**
 * A first click's card genuinely doesn't exist in the DOM on the very
 * first frame after `trigger` changes — `AnchoredCard` only renders once
 * `anchor` resolves, and `anchor` (from `useProjectedPoint`) starts out
 * `null`/stale until ITS OWN effect fires and re-renders. That's at
 * least one extra React commit beyond this hook's own effect, and
 * exactly how many frames it takes isn't something to hard-code — so
 * this polls for a bounded number of frames instead of assuming one is
 * enough. 20 frames (~330ms at 60fps) is generously more than the 1-2
 * extra commits this ever actually needs; it exists as a real ceiling,
 * not a tuned value.
 */
const MAX_FRAMES_TO_WAIT = 20;

/**
 * Whenever `trigger` changes (a new card just opened), nudges the map so
 * the element `cardRef` points at ends up fully inside the map's own
 * container — not just the anchor point `AnchoredCard`'s own CSS clamps
 * against, which can't account for the card's real rendered height (a
 * photo, notes, attribution are all optional content, so the card's
 * height isn't knowable ahead of render). Deliberately keyed on `trigger`
 * (the selected id), not on the anchor's own screen position — that
 * changes continuously while a card is open (any pan, including this
 * hook's own corrective one), and re-running this check on every move
 * would fight a user deliberately dragging a near-edge card into view
 * themselves.
 */
export function usePanCardIntoView(
  map: MapLibreMap | null,
  cardRef: RefObject<HTMLElement | null>,
  trigger: unknown,
): void {
  useEffect(() => {
    if (!map || trigger === null || trigger === undefined) return;

    let rafId: number;
    let framesWaited = 0;

    const attempt = () => {
      const card = cardRef.current;
      const cardRect = card?.getBoundingClientRect();

      // Not rendered yet (anchor still resolving) or not laid out yet
      // (zero size) — keep waiting rather than silently doing nothing,
      // up to the frame ceiling.
      if (!cardRect || (cardRect.width === 0 && cardRect.height === 0)) {
        framesWaited += 1;
        if (framesWaited < MAX_FRAMES_TO_WAIT) {
          rafId = requestAnimationFrame(attempt);
        }
        return;
      }

      const containerRect = map.getContainer().getBoundingClientRect();

      let shiftX = 0;
      if (cardRect.left < containerRect.left + MARGIN) {
        shiftX = cardRect.left - (containerRect.left + MARGIN);
      } else if (cardRect.right > containerRect.right - MARGIN) {
        shiftX = cardRect.right - (containerRect.right - MARGIN);
      }

      let shiftY = 0;
      if (cardRect.top < containerRect.top + MARGIN) {
        shiftY = cardRect.top - (containerRect.top + MARGIN);
      } else if (cardRect.bottom > containerRect.bottom - MARGIN) {
        shiftY = cardRect.bottom - (containerRect.bottom - MARGIN);
      }

      if (shiftX === 0 && shiftY === 0) return;

      const centerPoint: [number, number] = [
        containerRect.width / 2 + shiftX,
        containerRect.height / 2 + shiftY,
      ];
      map.easeTo({ center: map.unproject(centerPoint), duration: 300 });
    };

    rafId = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(rafId);
  }, [map, cardRef, trigger]);
}
