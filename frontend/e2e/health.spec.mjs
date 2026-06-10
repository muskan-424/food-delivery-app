import { test, expect } from "@playwright/test";
import { API_BASE } from "./helpers/api.mjs";

test.describe("API health", () => {
  test("health and capabilities endpoints respond", async ({ request }) => {
    const health = await request.get(`${API_BASE}/api/health`);
    expect(health.ok()).toBeTruthy();
    const healthJson = await health.json();
    expect(healthJson.success).toBeTruthy();

    const caps = await request.get(`${API_BASE}/api/health/capabilities`);
    expect(caps.ok()).toBeTruthy();
    const capsJson = await caps.json();
    expect(capsJson.data?.flags).toBeTruthy();
  });
});
