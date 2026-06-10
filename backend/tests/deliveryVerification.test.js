import { describe, expect, it } from "vitest";
import { scoreDeliveryVerification } from "../services/deliveryVerificationService.js";

function order(overrides = {}) {
  return {
    status: "delivered",
    proofOfDelivery: {
      method: "otp",
      verifiedAt: new Date(),
      ...overrides.proofOfDelivery,
    },
    ...overrides,
  };
}

describe("scoreDeliveryVerification", () => {
  it("fails when order not delivered", () => {
    const score = scoreDeliveryVerification(order({ status: "preparing" }));
    expect(score.outcome).toBe("FAIL");
    expect(score.reasons).toContain("order_not_delivered");
  });

  it("passes OTP POD", () => {
    const score = scoreDeliveryVerification(order({ proofOfDelivery: { method: "otp", verifiedAt: new Date() } }));
    expect(score.outcome).toBe("PASS");
  });

  it("passes before+after photos with higher confidence", () => {
    const score = scoreDeliveryVerification(
      order({
        proofOfDelivery: {
          method: "photo",
          verifiedAt: new Date(),
          beforeImageUrl: "https://cdn/before.jpg",
          afterImageUrl: "https://cdn/after.jpg",
        },
      })
    );
    expect(score.outcome).toBe("PASS");
    expect(score.confidence).toBeGreaterThanOrEqual(0.9);
    expect(score.reasons).toContain("before_after_photos_present");
  });

  it("low confidence for photo without evidence", () => {
    const score = scoreDeliveryVerification(
      order({ proofOfDelivery: { method: "photo", verifiedAt: new Date() } })
    );
    expect(score.outcome).toBe("LOW_CONFIDENCE");
  });

  it("passes signature with name", () => {
    const score = scoreDeliveryVerification(
      order({
        proofOfDelivery: {
          method: "signature",
          verifiedAt: new Date(),
          signatureName: "Alex",
        },
      })
    );
    expect(score.outcome).toBe("PASS");
  });
});
