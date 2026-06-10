import { describe, expect, it } from "vitest";
import {
  classifyAgentIntent,
  confidenceFromToolTrace,
} from "../services/agentIntentService.js";

describe("classifyAgentIntent", () => {
  it("detects order status questions", () => {
    const r = classifyAgentIntent("where is my order?");
    expect(r.intent).toBe("order_status");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("detects food search", () => {
    const r = classifyAgentIntent("search for biryani near me");
    expect(r.intent).toBe("food_search");
  });

  it("detects cart hints", () => {
    const r = classifyAgentIntent("what is in my cart");
    expect(r.intent).toBe("cart_hints");
  });

  it("detects app help", () => {
    const r = classifyAgentIntent("how do I pay for my order");
    expect(r.intent).toBe("app_help");
  });

  it("falls back to general_help", () => {
    const r = classifyAgentIntent("hello there");
    expect(r.intent).toBe("general_help");
  });
});

describe("confidenceFromToolTrace", () => {
  it("returns higher confidence when tools succeed", () => {
    const low = confidenceFromToolTrace([{ ok: false, confidence: 0.3 }]);
    const high = confidenceFromToolTrace([
      { ok: true, confidence: 0.9 },
      { ok: true, confidence: 0.85 },
    ]);
    expect(high).toBeGreaterThan(low);
  });
});
