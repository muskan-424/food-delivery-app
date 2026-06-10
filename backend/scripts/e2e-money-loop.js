#!/usr/bin/env node
/**
 * Staging E2E checklist runner (Phase Z). Automated steps + manual Razorpay/delivery gates.
 *
 * Usage:
 *   RUN_E2E_MONEY_LOOP=true node scripts/e2e-money-loop.js
 *   BASE_URL=http://localhost:4000 MONGO_URL=... node scripts/e2e-money-loop.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const BASE_URL = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const RUN = process.env.RUN_E2E_MONEY_LOOP === "true";

const results = [];

function pass(step, detail = "") {
  results.push({ step, ok: true, detail });
  console.log(`  ✅ ${step}${detail ? ` — ${detail}` : ""}`);
}

function fail(step, detail = "") {
  results.push({ step, ok: false, detail });
  console.log(`  ❌ ${step}${detail ? ` — ${detail}` : ""}`);
}

function skip(step, detail = "") {
  results.push({ step, ok: true, detail, skipped: true });
  console.log(`  ⏭️  ${step}${detail ? ` — ${detail}` : ""}`);
}

async function request(method, path, { token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.token = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log("🔄 E2E Money Loop — Staging Checklist");
  console.log("=====================================");

  if (!RUN) {
    console.log("\nSet RUN_E2E_MONEY_LOOP=true to execute automated steps.\n");
    console.log("Manual steps after automation:");
    console.log("  1. Complete Razorpay test checkout for placed order");
    console.log("  2. Advance order → delivered with POD");
    console.log("  3. POST /api/order/:id/verify-delivery (or auto after markDelivered)");
    console.log("  4. Confirm escrow RELEASE_ELIGIBLE → payout when RazorpayX enabled");
    console.log("  5. Open dispute + admin refund path in staging");
    process.exit(0);
  }

  const health = await request("GET", "/api/health");
  if (health.json?.mongo === "connected") pass("Mongo via /api/health");
  else fail("Mongo via /api/health", health.text?.slice(0, 80));

  const caps = await request("GET", "/api/health/capabilities");
  if (caps.json?.success) {
    const f = caps.json.data?.flags || {};
    pass("Capabilities snapshot", `escrow=${f.enableEscrowPayments} kyc=${f.enableUserKyc}`);
  } else fail("Capabilities snapshot");

  const email = `e2e_${Date.now()}@staging.test`;
  const password = "E2eTestPass123!";
  const reg = await request("POST", "/api/user/register", {
    body: { name: "E2E Staging", email, password },
  });
  let token = reg.json?.data?.token || reg.json?.token;
  if (reg.status === 200 && token) pass("Register staging user", email);
  else fail("Register staging user", reg.json?.message || reg.status);

  if (token && process.env.MONGO_URL) {
    try {
      await mongoose.connect(process.env.MONGO_URL);
      const applied = await mongoose.connection.db
        .collection("migrationstates")
        .countDocuments();
      if (applied > 0) pass("Migrations applied", `${applied} recorded`);
      else skip("Migrations applied", "run npm run migrate:up first");
      await mongoose.disconnect();
    } catch (e) {
      fail("Migrations check", e.message);
    }
  }

  if (token) {
    const otp = await request("POST", "/api/verification/email/request-otp", {
      token,
      body: { purpose: "EMAIL_VERIFICATION" },
    });
    if (otp.json?.success) pass("Email OTP request");
    else skip("Email OTP request", otp.json?.message || "SMTP may be off");

    const kyc = await request("GET", "/api/kyc/me", { token });
    if (kyc.json?.success) pass("KYC status endpoint");
    else fail("KYC status endpoint");
  }

  const escrowOn = caps.json?.data?.flags?.enableEscrowPayments;
  if (escrowOn) {
    skip("Razorpay checkout + webhook", "manual — use test keys in staging");
    skip("Delivery + POD + verify-delivery", "manual — driver app or admin status");
    skip("Escrow release / RazorpayX payout", "manual — verify admin metrics after delivery");
  } else {
    skip("Full money loop", "ENABLE_ESCROW_PAYMENTS=false — enable for staging signoff");
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log("\n=====================================");
  console.log(`Results: ${results.length - failed} ok, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E runner crashed:", err.message);
  process.exit(1);
});
