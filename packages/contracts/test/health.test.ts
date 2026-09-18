import { describe, expect, it } from "vitest";
import { HealthStatusSchema } from "../src/health.js";

describe("HealthStatusSchema", () => {
  it("accepts a well-formed health response", () => {
    const health = HealthStatusSchema.parse({
      status: "ok",
      timestamp: "2026-09-18T20:16:07.527Z",
    });
    expect(health.status).toBe("ok");
  });

  it("rejects a status other than 'ok' — there is no degraded state in v1", () => {
    expect(() => HealthStatusSchema.parse({ status: "degraded", timestamp: "x" })).toThrow();
  });

  it("rejects a missing timestamp", () => {
    expect(() => HealthStatusSchema.parse({ status: "ok" })).toThrow();
  });
});
