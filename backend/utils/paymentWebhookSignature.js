import crypto from "crypto";

/**
 * Verify `X-Payment-Webhook-Signature: sha256=<hex>` where hex = HMAC-SHA256(secret, rawBody).
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHeader
 * @param {string|undefined} secret
 */
export function verifyPaymentWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret || !rawBody?.length) {
    return false;
  }
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const trimmed = signatureHeader.trim();
  const expected = trimmed.toLowerCase().startsWith("sha256=")
    ? trimmed.slice(7).trim()
    : trimmed;

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(hmac, "hex");
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
