import { describe, expect, it } from "vitest";
import {
  buildEscrowPayoutIdempotencyKey,
  evaluatePayoutFraudRules,
  getDefaultPayoutFraudRules,
} from "../services/payoutFraudRulesService.js";

describe("evaluatePayoutFraudRules", () => {
  const rules = getDefaultPayoutFraudRules();

  it("allows clean signals", () => {
    const result = evaluatePayoutFraudRules(
      {
        hasOpenDispute: false,
        chargebackFlag: false,
        customerBlocked: false,
        customerWarnings: 0,
        hasChargebackSegment: false,
        recentPayoutCount: 0,
      },
      rules
    );
    expect(result.blocked).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks open dispute", () => {
    const result = evaluatePayoutFraudRules(
      { hasOpenDispute: true, chargebackFlag: false, customerBlocked: false, customerWarnings: 0, hasChargebackSegment: false, recentPayoutCount: 0 },
      rules
    );
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain("open_dispute");
  });

  it("blocks chargeback flag", () => {
    const result = evaluatePayoutFraudRules(
      { hasOpenDispute: false, chargebackFlag: true, customerBlocked: false, customerWarnings: 0, hasChargebackSegment: false, recentPayoutCount: 0 },
      rules
    );
    expect(result.reasons).toContain("chargeback_flag");
  });

  it("blocks high warnings", () => {
    const result = evaluatePayoutFraudRules(
      { hasOpenDispute: false, chargebackFlag: false, customerBlocked: false, customerWarnings: 3, hasChargebackSegment: false, recentPayoutCount: 0 },
      rules
    );
    expect(result.reasons).toContain("high_warnings");
  });

  it("blocks payout velocity", () => {
    const result = evaluatePayoutFraudRules(
      {
        hasOpenDispute: false,
        chargebackFlag: false,
        customerBlocked: false,
        customerWarnings: 0,
        hasChargebackSegment: false,
        recentPayoutCount: rules.maxPayoutsPerUserPerHour,
      },
      rules
    );
    expect(result.reasons).toContain("payout_velocity");
  });

  it("skips all checks when rules disabled", () => {
    const result = evaluatePayoutFraudRules(
      { hasOpenDispute: true, chargebackFlag: true, customerBlocked: true, customerWarnings: 9, hasChargebackSegment: true, recentPayoutCount: 99 },
      { ...rules, enabled: false }
    );
    expect(result.blocked).toBe(false);
  });
});

describe("buildEscrowPayoutIdempotencyKey", () => {
  it("is stable per escrow id", () => {
    expect(buildEscrowPayoutIdempotencyKey("abc123")).toBe("payout-abc123");
  });
});
