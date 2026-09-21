import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { RefObject } from "react";
import { Map as MapMock, mapInstances, resetMaplibreMock } from "../../test/maplibre-mock.js";
import { usePanCardIntoView } from "./usePanCardIntoView.js";

function newMap() {
  return new MapMock({}) as unknown as import("maplibre-gl").Map;
}

/** A fake card element with a fixed bounding rect, for the hook's `cardRef`. */
function fakeCardRef(rect: Partial<DOMRect>): RefObject<HTMLElement | null> {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect;
  return { current: el };
}

const CONTAINER_RECT = { left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800 };

function mockContainer(map: ReturnType<typeof newMap>, rect: Partial<DOMRect> = CONTAINER_RECT) {
  (mapInstances[0]!.getContainer as ReturnType<typeof import("vitest").vi.fn>).mockReturnValue({
    getBoundingClientRect: () => ({ x: 0, y: 0, toJSON: () => ({}), ...CONTAINER_RECT, ...rect }) as DOMRect,
  });
  return map;
}

describe("usePanCardIntoView", () => {
  beforeEach(() => resetMaplibreMock());

  it("does nothing when trigger is null", async () => {
    const map = newMap();
    mockContainer(map);
    const cardRef = fakeCardRef({ left: -100, top: 100, right: 100, bottom: 300 });

    renderHook(() => usePanCardIntoView(map, cardRef, null));

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mapInstances[0]!.easeTo).not.toHaveBeenCalled();
  });

  it("does nothing when the card is already fully within the container bounds", async () => {
    const map = newMap();
    mockContainer(map);
    // Well inside the 400x800 container with margin to spare.
    const cardRef = fakeCardRef({ left: 100, top: 100, right: 300, bottom: 300 });

    renderHook(() => usePanCardIntoView(map, cardRef, "sighting-1"));

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mapInstances[0]!.easeTo).not.toHaveBeenCalled();
  });

  it("pans so content shifts DOWN when the card overflows the top edge — the unproject point must be ABOVE center", async () => {
    const map = newMap();
    mockContainer(map);
    // Card's top is above the container's top (negative), overflowing upward.
    const cardRef = fakeCardRef({ left: 100, top: -50, right: 300, bottom: 150 });

    renderHook(() => usePanCardIntoView(map, cardRef, "sighting-1"));

    await waitFor(() => expect(mapInstances[0]!.easeTo).toHaveBeenCalled());
    const unprojectedPoint = mapInstances[0]!.unproject.mock.calls[0]![0] as [number, number];
    // Container center is [200, 400]; a point ABOVE center has a smaller y.
    expect(unprojectedPoint[1]).toBeLessThan(400);
    expect(unprojectedPoint[0]).toBeCloseTo(200, 0); // no horizontal overflow, x unchanged
  });

  it("pans so content shifts UP when the card overflows the bottom edge — the unproject point must be BELOW center", async () => {
    const map = newMap();
    mockContainer(map);
    // Card's bottom (850) is past the container's bottom (800).
    const cardRef = fakeCardRef({ left: 100, top: 650, right: 300, bottom: 850 });

    renderHook(() => usePanCardIntoView(map, cardRef, "sighting-1"));

    await waitFor(() => expect(mapInstances[0]!.easeTo).toHaveBeenCalled());
    const unprojectedPoint = mapInstances[0]!.unproject.mock.calls[0]![0] as [number, number];
    expect(unprojectedPoint[1]).toBeGreaterThan(400);
  });

  it("pans so content shifts RIGHT when the card overflows the left edge — the unproject point must be LEFT of center", async () => {
    const map = newMap();
    mockContainer(map);
    // Card's left (-50) is past the container's left (0).
    const cardRef = fakeCardRef({ left: -50, top: 300, right: 150, bottom: 500 });

    renderHook(() => usePanCardIntoView(map, cardRef, "sighting-1"));

    await waitFor(() => expect(mapInstances[0]!.easeTo).toHaveBeenCalled());
    const unprojectedPoint = mapInstances[0]!.unproject.mock.calls[0]![0] as [number, number];
    expect(unprojectedPoint[0]).toBeLessThan(200);
  });

  it("pans so content shifts LEFT when the card overflows the right edge — the unproject point must be RIGHT of center", async () => {
    const map = newMap();
    mockContainer(map);
    // Card's right (450) is past the container's right (400).
    const cardRef = fakeCardRef({ left: 250, top: 300, right: 450, bottom: 500 });

    renderHook(() => usePanCardIntoView(map, cardRef, "sighting-1"));

    await waitFor(() => expect(mapInstances[0]!.easeTo).toHaveBeenCalled());
    const unprojectedPoint = mapInstances[0]!.unproject.mock.calls[0]![0] as [number, number];
    expect(unprojectedPoint[0]).toBeGreaterThan(200);
  });

  it("does not re-run the check on every render — only when trigger changes", async () => {
    const map = newMap();
    mockContainer(map);
    const cardRef = fakeCardRef({ left: 100, top: 100, right: 300, bottom: 300 });

    const { rerender } = renderHook(({ trigger }) => usePanCardIntoView(map, cardRef, trigger), {
      initialProps: { trigger: "sighting-1" },
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    rerender({ trigger: "sighting-1" });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // getContainer is only read inside the effect's rAF callback — called
    // exactly once for the one real trigger change, not again for the
    // no-op rerender with the same trigger value.
    expect(mapInstances[0]!.getContainer).toHaveBeenCalledTimes(1);
  });
});
