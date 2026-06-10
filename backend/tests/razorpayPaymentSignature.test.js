import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("verifyRazorpayPaymentSignature", () => {
  const prevId = process.env.RAZORPAY_KEY_ID;
  const prevSecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
    process.env.RAZORPAY_KEY_SECRET = "secret_for_unit_tests";
  });

  afterEach(() => {
    process.env.RAZORPAY_KEY_ID = prevId;
    process.env.RAZORPAY_KEY_SECRET = prevSecret;
  });

  it("validates checkout callback signature", async () => {
    const { verifyRazorpayPaymentSignature } = await import("../services/razorpayService.js");
    const orderId = "order_test123";
    const paymentId = "pay_test456";
    const body = `${orderId}|${paymentId}`;
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");
    expect(verifyRazorpayPaymentSignature(orderId, paymentId, signature)).toBe(true);
  });

  it("rejects invalid signature", async () => {
    const { verifyRazorpayPaymentSignature } = await import("../services/razorpayService.js");
    expect(verifyRazorpayPaymentSignature("order_a", "pay_b", "deadbeef")).toBe(false);
  });

  it("rejects empty payment id", async () => {
    const { verifyRazorpayPaymentSignature } = await import("../services/razorpayService.js");
    expect(verifyRazorpayPaymentSignature("order_a", "", "abc")).toBe(false);
  });
});
