import { describe, expect, it } from "vitest";
import { ageBucket, ageInDays } from "./ageBucket.js";

const NOW = new Date("2026-09-19T12:00:00.000Z");

describe("ageInDays", () => {
  it("returns 0 for a timestamp a few hours ago", () => {
    expect(ageInDays("2026-09-19T06:00:00.000Z", NOW)).toBe(0);
  });

  it("returns whole days elapsed, floored", () => {
    expect(ageInDays("2026-09-17T13:00:00.000Z", NOW)).toBe(1);
    expect(ageInDays("2026-09-09T12:00:00.000Z", NOW)).toBe(10);
  });

  it("never returns negative for a future timestamp (clock skew safety)", () => {
    expect(ageInDays("2026-09-20T12:00:00.000Z", NOW)).toBe(0);
  });

  it("returns 0 (never NaN) for an unparseable observedAt, rather than propagating NaN through every downstream comparison", () => {
    expect(ageInDays("not-a-real-date", NOW)).toBe(0);
  });

  it("handles a bare YYYY-MM-DD date same as its UTC midnight", () => {
    expect(ageInDays("2026-09-15", NOW)).toBe(4);
  });
});

describe("ageBucket", () => {
  it("is 'today' for anything under 1 day old", () => {
    expect(ageBucket("2026-09-19T00:00:01.000Z", NOW)).toBe("today");
  });

  it("is 'this-week' from 1 day up to (not including) 7 days old", () => {
    expect(ageBucket("2026-09-18T00:00:00.000Z", NOW)).toBe("this-week");
    expect(ageBucket("2026-09-13T00:00:00.000Z", NOW)).toBe("this-week");
  });

  it("is 'this-month' from 7 days up to (not including) 30 days old", () => {
    expect(ageBucket("2026-09-12T12:00:00.000Z", NOW)).toBe("this-month");
    expect(ageBucket("2026-08-21T12:00:00.000Z", NOW)).toBe("this-month");
  });

  it("is 'older' at 30 days and beyond", () => {
    expect(ageBucket("2026-08-20T12:00:00.000Z", NOW)).toBe("older");
    expect(ageBucket("2020-01-01T00:00:00.000Z", NOW)).toBe("older");
  });
});
