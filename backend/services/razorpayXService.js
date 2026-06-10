import { isRazorpayConfigured, getPublishableKeyId } from "./razorpayService.js";

function getKeySecret() {
  return (process.env.RAZORPAY_KEY_SECRET || "").trim();
}

function basicAuthHeader() {
  const keyId = getPublishableKeyId();
  const keySecret = getKeySecret();
  const token = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return `Basic ${token}`;
}

export function getRazorpayPayoutAccountNumber() {
  return String(process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER || "").trim();
}

export function isRazorpayXConfigured() {
  return isRazorpayConfigured() && Boolean(getRazorpayPayoutAccountNumber());
}

async function razorpayXRequest(path, { method = "GET", body, idempotencyKey } = {}) {
  const headers = {
    Authorization: basicAuthHeader(),
    "Content-Type": "application/json",
  };
  if (idempotencyKey) {
    headers["X-Payout-Idempotency"] = String(idempotencyKey).slice(0, 36);
  }
  const res = await fetch(`https://api.razorpay.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`RazorpayX ${method} ${path} failed: ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function createRazorpayContact({ name, email, phone, referenceId }) {
  const digits = String(phone || "").replace(/\D/g, "");
  const contactPhone = digits.length >= 10 ? digits.slice(-10) : "9999999999";
  return razorpayXRequest("/v1/contacts", {
    method: "POST",
    body: {
      name: String(name || "Partner").slice(0, 50),
      email: String(email || "").slice(0, 120),
      contact: contactPhone,
      type: "vendor",
      reference_id: String(referenceId || "").slice(0, 40),
    },
  });
}

export async function createRazorpayFundAccountBank({
  contactId,
  beneficiaryName,
  ifsc,
  accountNumber,
}) {
  return razorpayXRequest("/v1/fund_accounts", {
    method: "POST",
    body: {
      contact_id: contactId,
      account_type: "bank_account",
      bank_account: {
        name: String(beneficiaryName || "").slice(0, 50),
        ifsc: String(ifsc || "").toUpperCase().slice(0, 11),
        account_number: String(accountNumber || ""),
      },
    },
  });
}

export async function createRazorpayPayout({
  fundAccountId,
  amountPaise,
  currency = "INR",
  referenceId,
  idempotencyKey,
  narration = "Order escrow payout",
}) {
  return razorpayXRequest("/v1/payouts", {
    method: "POST",
    idempotencyKey,
    body: {
      account_number: getRazorpayPayoutAccountNumber(),
      fund_account_id: fundAccountId,
      amount: Math.floor(amountPaise),
      currency,
      mode: "IMPS",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: String(referenceId || "").slice(0, 40),
      narration: String(narration || "").slice(0, 30),
    },
  });
}

export async function fetchRazorpayFundAccount(fundAccountId) {
  return razorpayXRequest(`/v1/fund_accounts/${fundAccountId}`);
}
