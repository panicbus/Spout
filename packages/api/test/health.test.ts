import { HealthStatusSchema } from "@spout/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("responds 200 with a body that validates against the shared HealthStatusSchema", async () => {
    const app = createApp();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = HealthStatusSchema.parse(await res.json());
    expect(body.status).toBe("ok");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("sends CORS headers so packages/web can fetch it from a different dev-server origin", async () => {
    const app = createApp();
    const res = await app.request("/health", { headers: { Origin: "http://localhost:5173" } });

    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});
