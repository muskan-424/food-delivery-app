import { appConfig } from "../config/appConfig.js";

function normalizePhone(phone) {
  const p = String(phone || "").replace(/\s+/g, "");
  if (!p) return "";
  if (p.startsWith("+")) return p;
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return p;
}

async function sendTwilioSms({ to, body }) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = appConfig.twilioFromPhone;
  if (!accountSid || !authToken || !from) {
    return { ok: false, provider: "twilio", reason: "missing_twilio_config" };
  }
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", from);
  form.set("Body", body);
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    return { ok: false, provider: "twilio", reason: `twilio_http_${resp.status}`, detail: txt };
  }
  const json = await resp.json();
  return { ok: true, provider: "twilio", messageId: json?.sid || "" };
}

export async function sendSmsMessage({ toPhone, message }) {
  const to = normalizePhone(toPhone);
  const body = String(message || "").trim();
  if (!to) return { ok: false, provider: "none", reason: "missing_phone" };
  if (!body) return { ok: false, provider: "none", reason: "missing_message" };
  const provider = appConfig.deliveryOtpSmsProvider;
  if (provider === "none") {
    return { ok: false, provider, reason: "provider_disabled" };
  }
  if (provider === "mock") {
    console.log(`[sms:mock] to=${to} body="${body}"`);
    return { ok: true, provider: "mock", messageId: `mock-${Date.now()}` };
  }
  if (provider === "twilio") {
    try {
      return await sendTwilioSms({ to, body });
    } catch (err) {
      return { ok: false, provider: "twilio", reason: "twilio_exception", detail: err?.message };
    }
  }
  return { ok: false, provider, reason: "unsupported_provider" };
}

export async function sendDeliveryOtpSms({ toPhone, otp, orderNumber }) {
  const body = `Food Delivery OTP for order ${orderNumber || ""}: ${otp}. Share only with delivery partner.`;
  return sendSmsMessage({ toPhone, message: body });
}

