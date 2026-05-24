import crypto from "crypto";

/**
 * Stripe webhook: Stripe-Signature header (t=timestamp,v1=hex,...).
 * Signed payload: `${timestamp}.${rawBodyUtf8}` with HMAC-SHA256 using webhook signing secret (whsec_...).
 */
export function verifyStripeWebhookSignature(
  rawBody,
  stripeSignatureHeader,
  secret,
  { toleranceSeconds = 300 } = {}
) {
  if (!secret || !rawBody?.length || !stripeSignatureHeader) {
    return false;
  }

  const parts = String(stripeSignatureHeader).split(",").map((p) => p.trim());
  let timestamp = null;
  const v1Sigs = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Sigs.push(value);
  }
  if (!timestamp || v1Sigs.length === 0) {
    return false;
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > toleranceSeconds) {
    return false;
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
  const signedPayload = `${timestamp}.${payload}`;
  const expectedHex = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  try {
    const expectedBuf = Buffer.from(expectedHex, "hex");
    return v1Sigs.some((sig) => {
      try {
        const a = Buffer.from(String(sig).trim(), "hex");
        if (a.length !== expectedBuf.length) return false;
        return crypto.timingSafeEqual(a, expectedBuf);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Razorpay: X-Razorpay-Signature is hex HMAC-SHA256(webhook_secret, raw_body).
 */
export function verifyRazorpayWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret || !rawBody?.length || !signatureHeader) {
    return false;
  }
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const expected = crypto.createHmac("sha256", secret).update(bodyBuf).digest("hex");
  const got = String(signatureHeader).trim().toLowerCase();
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(got, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
