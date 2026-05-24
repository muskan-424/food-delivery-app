import Razorpay from "razorpay";
import crypto from "crypto";

let client;

function getKeyId() {
  return (process.env.RAZORPAY_KEY_ID || "").trim();
}

function getKeySecret() {
  return (process.env.RAZORPAY_KEY_SECRET || "").trim();
}

export function isRazorpayConfigured() {
  return Boolean(getKeyId() && getKeySecret());
}

export function getPublishableKeyId() {
  return getKeyId();
}

export function getRazorpayClient() {
  if (!isRazorpayConfigured()) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  }
  if (!client) {
    client = new Razorpay({
      key_id: getKeyId(),
      key_secret: getKeySecret(),
    });
  }
  return client;
}

/**
 * @param {object} opts
 * @param {number} opts.amountPaise - Amount in paise (INR smallest unit)
 * @param {string} opts.receipt - Short receipt id (max 40 chars per Razorpay)
 * @param {Record<string, string>} [opts.notes]
 */
export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const rz = getRazorpayClient();
  return rz.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: String(receipt).slice(0, 40),
    notes: notes || {},
  });
}

export async function fetchRazorpayPayment(paymentId) {
  const rz = getRazorpayClient();
  return rz.payments.fetch(paymentId);
}

/**
 * Create refund against a captured Razorpay payment.
 * @param {string} paymentId - Razorpay payment id (pay_*)
 * @param {{ amountPaise?: number, notes?: Record<string, string> }} [opts]
 */
export async function createRazorpayRefund(paymentId, opts = {}) {
  const rz = getRazorpayClient();
  const payload = {};
  if (Number.isFinite(opts.amountPaise) && opts.amountPaise > 0) {
    payload.amount = Math.floor(opts.amountPaise);
  }
  if (opts.notes && typeof opts.notes === "object") {
    payload.notes = opts.notes;
  }
  return rz.payments.refund(String(paymentId), payload);
}

/**
 * Checkout callback signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 */
export function verifyRazorpayPaymentSignature(razorpayOrderId, razorpayPaymentId, signature) {
  const secret = getKeySecret();
  if (!secret || !razorpayOrderId || !razorpayPaymentId || !signature) return false;
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(String(signature).trim(), "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
