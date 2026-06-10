import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  verifyRazorpayWebhookSignature,
  verifyStripeWebhookSignature,
} from "../utils/paymentProviderWebhookVerify.js";

function razorpaySig(secret, body) {
  return crypto.createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex");
}

describe("verifyRazorpayWebhookSignature", () => {
  const secret = "whsec_test_razorpay";
  const body = JSON.stringify({ event: "payment.captured", id: "evt_1" });

  it("accepts valid HMAC signature", () => {
    const sig = razorpaySig(secret, body);
    expect(verifyRazorpayWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("rejects wrong secret", () => {
    const sig = razorpaySig(secret, body);
    expect(verifyRazorpayWebhookSignature(body, sig, "other_secret")).toBe(false);
  });

  it("rejects tampered body", () => {
    const sig = razorpaySig(secret, body);
    expect(verifyRazorpayWebhookSignature(body + "x", sig, secret)).toBe(false);
  });

  it("rejects missing inputs", () => {
    expect(verifyRazorpayWebhookSignature("", "abc", secret)).toBe(false);
    expect(verifyRazorpayWebhookSignature(body, "", secret)).toBe(false);
    expect(verifyRazorpayWebhookSignature(body, "abc", "")).toBe(false);
  });
});

describe("verifyStripeWebhookSignature", () => {
  const secret = "whsec_stripe_test";
  const payload = '{"id":"evt_123"}';
  const ts = Math.floor(Date.now() / 1000);

  it("accepts valid v1 signature within tolerance", () => {
    const signed = `${ts}.${payload}`;
    const v1 = crypto.createHmac("sha256", secret).update(signed, "utf8").digest("hex");
    const header = `t=${ts},v1=${v1}`;
    expect(verifyStripeWebhookSignature(payload, header, secret)).toBe(true);
  });

  it("rejects expired timestamp", () => {
    const oldTs = ts - 4000;
    const signed = `${oldTs}.${payload}`;
    const v1 = crypto.createHmac("sha256", secret).update(signed, "utf8").digest("hex");
    const header = `t=${oldTs},v1=${v1}`;
    expect(verifyStripeWebhookSignature(payload, header, secret, { toleranceSeconds: 300 })).toBe(
      false
    );
  });
});
