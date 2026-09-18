import { describe, expect, it } from "vitest";
import { dateDaysAgo, sinceDateForWindow } from "../src/timeWindow.js";

describe("dateDaysAgo", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");

  it("returns today's date for 0 days", () => {
    expect(dateDaysAgo(0, now)).toBe("2026-09-18");
  });

  it("returns a date N days before now", () => {
    expect(dateDaysAgo(400, now)).toBe("2025-08-14");
  });
});

describe("sinceDateForWindow", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");

  it("30d maps to 30 days before now", () => {
    expect(sinceDateForWindow("30d", now)).toBe("2026-08-19");
  });

  it("90d maps to 90 days before now", () => {
    expect(sinceDateForWindow("90d", now)).toBe("2026-06-20");
  });

  it("12m maps to 365 days before now", () => {
    expect(sinceDateForWindow("12m", now)).toBe("2025-09-18");
  });

  it("latest maps to a short 7-day window — the freshest GBIF supports until R3 adds iNaturalist direct (ADR 0002/0003)", () => {
    expect(sinceDateForWindow("latest", now)).toBe("2026-09-11");
  });
});
