import { describe, expect, it } from "vitest";
import { formatDateStamp } from "./dateFormat.js";

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
