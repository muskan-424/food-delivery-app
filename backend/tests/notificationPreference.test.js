import { describe, expect, it } from "vitest";
import { mapNotificationTypeToCategory } from "../services/notificationPreferenceService.js";

describe("mapNotificationTypeToCategory", () => {
  it("maps order_status exactly", () => {
    expect(mapNotificationTypeToCategory("order_status")).toBe("order_status");
  });

  it("maps payment-related types", () => {
    expect(mapNotificationTypeToCategory("payment_success")).toBe("payment");
    expect(mapNotificationTypeToCategory("refund_processed")).toBe("payment");
  });

  it("maps promo types", () => {
    expect(mapNotificationTypeToCategory("promo_campaign")).toBe("promo");
    expect(mapNotificationTypeToCategory("special_offer")).toBe("promo");
  });

  it("maps kyc types", () => {
    expect(mapNotificationTypeToCategory("kyc_verified")).toBe("kyc");
  });

  it("defaults unknown to system", () => {
    expect(mapNotificationTypeToCategory("random_alert")).toBe("system");
  });
});
