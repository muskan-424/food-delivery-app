import { describe, expect, it } from "vitest";
import {
  buildOrderRequestSchemaFromRules,
  normalizeOrderRequestSchema,
  validateOrderRequestSchema,
} from "../services/orderRequestSchemaService.js";

describe("orderRequestSchemaService", () => {
  it("parses catering request with guests and veg", () => {
    const raw = buildOrderRequestSchemaFromRules(
      "Need party catering for 50 people vegetarian biryani and snacks budget 15000 on 2026-12-25 6pm"
    );
    const schema = normalizeOrderRequestSchema(raw, "test");
    expect(schema.eventType).toBe("catering");
    expect(schema.guestCount).toBe(50);
    expect(schema.dietary.vegetarian).toBe(true);
    expect(schema.items.some((i) => /biryani/i.test(i.name))).toBe(true);
    const v = validateOrderRequestSchema(schema);
    expect(v.valid).toBe(true);
  });

  it("validates required fields", () => {
    const v = validateOrderRequestSchema({ title: "", description: "" });
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it("normalizes budget ordering", () => {
    const schema = normalizeOrderRequestSchema(
      { title: "T", description: "D", budget: { min: 9000, max: 3000 } },
      "x"
    );
    expect(schema.budget.min).toBeLessThanOrEqual(schema.budget.max);
  });
});
