import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, type RefObject } from "react";

const MARGIN = 16;

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
 *
 * Measured a frame after `trigger` changes, not synchronously in the
 * effect — `AnchoredCard` only renders once `anchor` resolves (via
 * `useProjectedPoint`'s own effect), which lands one render after the
 * selection itself changes; waiting for `requestAnimationFrame` measures
 * the card's real post-layout position instead of racing that.
 */
export function usePanCardIntoView(
  map: MapLibreMap | null,
  cardRef: RefObject<HTMLElement | null>,
  trigger: unknown,
): void {
  useEffect(() => {
    if (!map || trigger === null || trigger === undefined) return;

    const raf = requestAnimationFrame(() => {
      const card = cardRef.current;
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
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
    });

    return () => cancelAnimationFrame(raf);
  }, [map, cardRef, trigger]);
}
