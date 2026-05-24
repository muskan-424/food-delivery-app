import { appConfig } from "../config/appConfig.js";

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendExpoPush(tokens, payload) {
  const endpoint = "https://exp.host/--/api/v2/push/send";
  const accessToken = String(process.env.EXPO_ACCESS_TOKEN || "").trim();
  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title || "Notification",
    body: payload.body || "",
    data: payload.data || {},
  }));
  const batches = chunk(messages, 100);
  let sent = 0;
  let failed = 0;
  for (const batch of batches) {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    if (!resp.ok) {
      failed += batch.length;
      continue;
    }
    const data = await resp.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    for (const row of rows) {
      if (row?.status === "ok") sent += 1;
      else failed += 1;
    }
  }
  return { ok: sent > 0, provider: "expo", sent, failed };
}

export async function sendPushNotification({ tokens, title, body, data }) {
  const clean = Array.from(
    new Set((tokens || []).map((t) => String(t || "").trim()).filter(Boolean))
  );
  if (!clean.length) {
    return { ok: false, provider: "none", reason: "no_tokens", sent: 0, failed: 0 };
  }
  const provider = appConfig.pushProvider;
  if (provider === "none") {
    return { ok: false, provider, reason: "provider_disabled", sent: 0, failed: clean.length };
  }
  if (provider === "mock") {
    console.log("[push:mock]", { count: clean.length, title, body });
    return { ok: true, provider, sent: clean.length, failed: 0 };
  }
  if (provider === "expo") {
    try {
      return await sendExpoPush(clean, { title, body, data });
    } catch (err) {
      return {
        ok: false,
        provider,
        reason: "expo_exception",
        detail: err?.message || "",
        sent: 0,
        failed: clean.length,
      };
    }
  }
  return { ok: false, provider, reason: "unsupported_provider", sent: 0, failed: clean.length };
}

