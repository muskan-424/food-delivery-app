#!/usr/bin/env node
/**
 * End-to-end smoke tests for core backend flows.
 * Usage: node smoke-test.js
 * Env:   BASE_URL=http://localhost:4000 (default)
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { canTransition, ORDER_STATUSES } from "./constants/orderStatusMachine.js";

dotenv.config();

const BASE_URL = (process.env.BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const results = [];
let createdSmokeEmail = null;

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(method, path, { token, body, expectStatus } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.token = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
  }

  if (expectStatus !== undefined) {
    const allowed = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
    if (!allowed.includes(res.status)) {
      throw new Error(`${method} ${path} expected ${allowed.join("|")}, got ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  return { status: res.status, json, text };
}

function runUnitTests() {
  console.log("\n📦 Unit: order status machine");

  const forwardChain = [
    ["pending", "confirmed"],
    ["confirmed", "preparing"],
    ["preparing", "ready"],
    ["ready", "out_for_delivery"],
    ["out_for_delivery", "delivered"],
  ];

  for (const [from, to] of forwardChain) {
    if (canTransition(from, to)) {
      pass(`transition ${from} → ${to}`);
    } else {
      fail(`transition ${from} → ${to}`, "expected allowed");
    }
  }

  if (!canTransition("delivered", "pending")) {
    pass("blocks delivered → pending");
  } else {
    fail("blocks delivered → pending", "should be rejected");
  }

  if (canTransition("pending", "cancelled")) {
    pass("allows pending → cancelled");
  } else {
    fail("allows pending → cancelled");
  }

  if (ORDER_STATUSES.length === 7) {
    pass("ORDER_STATUSES has 7 states");
  } else {
    fail("ORDER_STATUSES count", `got ${ORDER_STATUSES.length}`);
  }
}

async function runHttpTests() {
  console.log("\n🌐 HTTP smoke tests (" + BASE_URL + ")");

  try {
    const health = await request("GET", "/api/health", { expectStatus: 200 });
    if (health.json?.success && health.json?.mongo === "connected") {
      pass("GET /api/health", "mongo connected");
    } else {
      fail("GET /api/health", JSON.stringify(health.json || health.text).slice(0, 120));
    }
  } catch (e) {
    fail("GET /api/health", e.message);
    throw new Error("Server unreachable — start backend with: npm run server");
  }

  try {
    const ops = await request("GET", "/api/health/ops", { expectStatus: 200 });
    if (ops.json?.success) pass("GET /api/health/ops");
    else fail("GET /api/health/ops", ops.json?.message || "no success flag");
  } catch (e) {
    fail("GET /api/health/ops", e.message);
  }

  try {
    const sched = await request("GET", "/api/health/scheduling-config", { expectStatus: 200 });
    if (sched.json?.success && sched.json?.scheduling) pass("GET /api/health/scheduling-config");
    else fail("GET /api/health/scheduling-config");
  } catch (e) {
    fail("GET /api/health/scheduling-config", e.message);
  }

  try {
    const food = await request("GET", "/api/food/list", { expectStatus: 200 });
    const items = food.json?.data ?? food.json?.foods ?? food.json;
  const count = Array.isArray(items) ? items.length : (food.json?.data?.items?.length ?? 0);
    if (food.json?.success !== false) {
      pass("GET /api/food/list", `${count} item(s)`);
    } else {
      fail("GET /api/food/list", food.json?.message || "failed");
    }
  } catch (e) {
    fail("GET /api/food/list", e.message);
  }

  try {
    const search = await request("GET", "/api/search?q=food&include=food", { expectStatus: 200 });
    if (search.json?.success !== false) pass("GET /api/search");
    else fail("GET /api/search", search.json?.message || "failed");
  } catch (e) {
    fail("GET /api/search", e.message);
  }

  const testEmail = `smoke_${Date.now()}@test.local`;
  createdSmokeEmail = testEmail;
  const testPassword = "SmokeTest1!";

  let userToken = null;
  try {
    const reg = await request("POST", "/api/user/register", {
      body: { name: "Smoke Tester", email: testEmail, password: testPassword },
      expectStatus: [200, 201],
    });
    userToken = reg.json?.data?.token || reg.json?.data?.accessToken || reg.json?.accessToken || reg.json?.token;
    if (userToken) pass("POST /api/user/register", testEmail);
    else fail("POST /api/user/register", "no token in response");
  } catch (e) {
    fail("POST /api/user/register", e.message);
  }

  if (userToken) {
    try {
      const login = await request("POST", "/api/user/login", {
        body: { email: testEmail, password: testPassword },
        expectStatus: 200,
      });
      const loginToken =
        login.json?.data?.token ||
        login.json?.data?.accessToken ||
        login.json?.token ||
        login.json?.accessToken;
      if (loginToken) pass("POST /api/user/login");
      else fail("POST /api/user/login", login.json?.message || "no token");
    } catch (e) {
      fail("POST /api/user/login", e.message);
    }

    try {
      const profile = await request("GET", "/api/profile", { token: userToken, expectStatus: 200 });
      if (profile.json?.success !== false) pass("GET /api/profile (auth)");
      else fail("GET /api/profile (auth)", profile.json?.message);
    } catch (e) {
      fail("GET /api/profile (auth)", e.message);
    }

    try {
      const growth = await request("GET", "/api/user/growth", { token: userToken, expectStatus: 200 });
      if (growth.json?.success !== false) pass("GET /api/user/growth");
      else fail("GET /api/user/growth", growth.json?.message);
    } catch (e) {
      fail("GET /api/user/growth", e.message);
    }

    try {
      const inbox = await request("GET", "/api/notifications/inbox", { token: userToken, expectStatus: 200 });
      if (inbox.json?.success !== false) pass("GET /api/notifications/inbox");
      else fail("GET /api/notifications/inbox", inbox.json?.message);
    } catch (e) {
      fail("GET /api/notifications/inbox", e.message);
    }
  }

  let adminToken = null;
  try {
    await mongoose.connect(process.env.MONGO_URL);
    const admin = await mongoose.connection.db.collection("users").findOne({ role: "admin" });
    if (admin) {
      adminToken = jwt.sign({ id: admin._id }, process.env.JWT_SECRET);
      pass("admin token from DB", admin.email || admin._id.toString());
    } else {
      fail("admin token from DB", "no admin user found");
    }
    await mongoose.disconnect();
  } catch (e) {
    fail("admin token from DB", e.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
  }

  if (adminToken) {
    try {
      const dash = await request("GET", "/api/admin/users/dashboard/stats", {
        token: adminToken,
        expectStatus: 200,
      });
      if (dash.json?.success !== false) {
        const keys = Object.keys(dash.json?.data || {}).join(", ") || "ok";
        pass("GET /api/admin/users/dashboard/stats", keys.slice(0, 80));
      } else {
        fail("GET /api/admin/users/dashboard/stats", dash.json?.message);
      }
    } catch (e) {
      fail("GET /api/admin/users/dashboard/stats", e.message);
    }

    try {
      const disputes = await request("GET", "/api/disputes/admin/summary", {
        token: adminToken,
        expectStatus: 200,
      });
      if (disputes.json?.success !== false) pass("GET /api/disputes/admin/summary");
      else fail("GET /api/disputes/admin/summary", disputes.json?.message);
    } catch (e) {
      fail("GET /api/disputes/admin/summary", e.message);
    }
  }
}

async function cleanupSmokeUser(email) {
  if (!email || !process.env.MONGO_URL) return;
  try {
    await mongoose.connect(process.env.MONGO_URL);
    const db = mongoose.connection.db;
    const user = await db.collection("users").findOne({ email: email.toLowerCase() });
    if (user) {
      await db.collection("refreshtokens").deleteMany({ userId: user._id });
      await db.collection("users").deleteOne({ _id: user._id });
    }
  } catch {
    /* best-effort cleanup */
  } finally {
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  console.log("🧪 Food Delivery — Smoke Test Suite");
  console.log("====================================");

  runUnitTests();

  try {
    await runHttpTests();
  } catch (e) {
    console.log("\n⚠️  " + e.message);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log("\n====================================");
  console.log(`📊 Results: ${passed} passed, ${failed} failed (${results.length} total)`);

  if (failed > 0) {
    console.log("\nFailed checks:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  • ${r.name}: ${r.detail}`));
    await cleanupSmokeUser(createdSmokeEmail);
    process.exit(1);
  }

  await cleanupSmokeUser(createdSmokeEmail);
  console.log("\n✅ All smoke tests passed — core flows look healthy.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n💥 Smoke test crashed:", err.message);
  await cleanupSmokeUser(createdSmokeEmail);
  process.exit(1);
});
