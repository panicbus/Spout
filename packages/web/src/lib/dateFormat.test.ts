import { describe, expect, it } from "vitest";
import { formatDateStamp, formatObservedAt } from "./dateFormat.js";

describe("formatDateStamp", () => {
  it("formats a bare YYYY-MM-DD date as a readable stamp", () => {
    expect(formatDateStamp("2026-09-15")).toBe("Sep 15, 2026");
  });

  it("does not shift the date backward in a negative-UTC-offset timezone (the classic bare-date-string bug)", () => {
    // "2026-09-15" parses as UTC midnight; formatting that Date in a
    // timezone behind UTC (e.g. US Pacific, UTC-7) without forcing the
    // UTC timeZone would print "Sep 14" instead of "Sep 15". Simulate a
    // Pacific-time viewer via the ICU timezone env var Node/V8 honors.
    const original = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatDateStamp("2026-09-15")).toBe("Sep 15, 2026");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("formatObservedAt", () => {
  it("formats a bare YYYY-MM-DD observedAt the same way formatDateStamp does (GBIF's shape)", () => {
    expect(formatObservedAt("2026-08-06")).toBe(formatDateStamp("2026-08-06"));
    expect(formatObservedAt("2026-08-06")).toBe("Aug 6, 2026");
  });

  it("does not crash on a full ISO datetime observedAt (iNaturalist's shape) — formatDateStamp alone would, since it appends its own 'T00:00:00Z' suffix to whatever string it's given", () => {
    expect(() => formatObservedAt("2026-08-06T13:21:00.000Z")).not.toThrow();
  });

  it("formats a full ISO datetime observedAt as a readable date", () => {
    expect(formatObservedAt("2026-08-06T13:21:00.000Z")).toBe("Aug 6, 2026");
  });

  it("formats a datetime observedAt with no explicit offset (a real, documented GBIF shape) without throwing", () => {
    expect(() => formatObservedAt("2026-08-06T13:21")).not.toThrow();
  });
});
