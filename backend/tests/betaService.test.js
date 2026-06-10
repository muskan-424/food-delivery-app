import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getBetaConfigPayload, getBetaFeatureFlags, isPinAllowedForBeta } from "../services/betaService.js";

describe("betaService", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("returns all features enabled when beta mode off", () => {
    process.env.BETA_MODE_ENABLED = "false";
    const flags = getBetaFeatureFlags();
    expect(flags.ai_assistant).toBe(true);
    expect(flags.group_orders).toBe(true);
  });

  it("respects beta nav flags when beta mode on", () => {
    process.env.BETA_MODE_ENABLED = "true";
    process.env.BETA_FEATURE_GROUP_ORDERS = "false";
    const flags = getBetaFeatureFlags();
    expect(flags.group_orders).toBe(false);
    expect(flags.ai_assistant).toBe(true);
  });

  it("validates pin codes when configured", () => {
    process.env.BETA_MODE_ENABLED = "true";
    process.env.BETA_PIN_CODES = "110001,110002";
    expect(isPinAllowedForBeta("110001")).toBe(true);
    expect(isPinAllowedForBeta("999999")).toBe(false);
  });

  it("config payload includes feedback path", () => {
    const payload = getBetaConfigPayload();
    expect(payload.feedback_path).toBe("/feedback");
    expect(Array.isArray(payload.categories)).toBe(true);
  });
});
