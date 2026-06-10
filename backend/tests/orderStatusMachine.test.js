import { describe, expect, it } from "vitest";
import { canTransition, ORDER_STATUSES } from "../constants/orderStatusMachine.js";

describe("orderStatusMachine", () => {
  it("allows forward fulfillment chain", () => {
    const chain = [
      ["pending", "confirmed"],
      ["confirmed", "preparing"],
      ["preparing", "ready"],
      ["ready", "out_for_delivery"],
      ["out_for_delivery", "delivered"],
    ];
    for (const [from, to] of chain) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it("blocks delivered rollback", () => {
    expect(canTransition("delivered", "pending")).toBe(false);
  });

  it("allows cancel from pending", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
  });

  it("has seven statuses", () => {
    expect(ORDER_STATUSES).toHaveLength(7);
  });
});
