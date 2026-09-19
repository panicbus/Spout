import { describe, expect, it } from "vitest";
import { formatDaysAgo, mostRecentObservedAt } from "./recency.js";

describe("mostRecentObservedAt", () => {
  it("returns null for an empty list", () => {
    expect(mostRecentObservedAt([])).toBeNull();
  });

  it("returns the single item's observedAt", () => {
    expect(mostRecentObservedAt([{ observedAt: "2026-09-10" }])).toBe("2026-09-10");
  });

  it("returns the latest observedAt regardless of input order", () => {
    const sightings = [
      { observedAt: "2026-09-01" },
      { observedAt: "2026-09-15" },
      { observedAt: "2026-09-08" },
    ];
    expect(mostRecentObservedAt(sightings)).toBe("2026-09-15");
  });

  it("compares by actual parsed time, not raw string order, across a bare date and a full datetime on the same calendar day", () => {
    // A bare "2026-09-19" parses as UTC midnight that day — the EARLIEST
    // possible instant on the 19th. Any same-day datetime with a real
    // time-of-day is later. This is a sanity check that epoch comparison
    // (not string comparison, which happens to agree here too) is what's
    // actually driving the result — see recency.ts's doc comment for the
    // case where they'd disagree (an offset-less local-time datetime).
    const sightings = [{ observedAt: "2026-09-19" }, { observedAt: "2026-09-19T05:00:00.000Z" }];
    expect(mostRecentObservedAt(sightings)).toBe("2026-09-19T05:00:00.000Z");
  });
});

describe("formatDaysAgo", () => {
  it("reads 'today' for 0 days", () => {
    expect(formatDaysAgo(0)).toBe("today");
  });

  it("reads singular for exactly 1 day", () => {
    expect(formatDaysAgo(1)).toBe("1 day ago");
  });

  it("reads plural for more than 1 day", () => {
    expect(formatDaysAgo(5)).toBe("5 days ago");
  });
});
