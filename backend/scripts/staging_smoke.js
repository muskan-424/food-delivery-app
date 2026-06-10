#!/usr/bin/env node
/**
 * Staging smoke checks — health, capabilities, ops snapshot.
 * Usage: node scripts/staging_smoke.js [baseUrl]
 * Exit 0 when all checks pass; 1 on failure.
 */
const base = (process.argv[2] || process.env.BASE_URL || "http://localhost:4000").replace(
  /\/$/,
  ""
);

const checks = [];

async function getJson(path, { required = true } = {}) {
  const url = `${base}${path}`;
  const start = Date.now();
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const ms = Date.now() - start;
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const ok = res.ok && body?.success !== false;
  checks.push({ path, ok, status: res.status, ms, required });
  if (!ok && required) {
    throw new Error(`${path} failed (${res.status}) in ${ms}ms`);
  }
  return { res, body, ms };
}

async function main() {
  console.log(`Staging smoke against ${base}`);

  const health = await getJson("/api/health");
  const mongo = health.body?.mongo || health.body?.health?.mongo;
  if (mongo && mongo !== "connected" && mongo !== "ok") {
    console.warn(`WARN: mongo status is ${mongo}`);
  }
  console.log(`  OK /api/health (${health.ms}ms)`);

  const caps = await getJson("/api/health/capabilities");
  const flags = caps.body?.data?.flags || {};
  console.log(`  OK /api/health/capabilities (${caps.ms}ms)`);
  console.log(`      escrow=${flags.enableEscrowPayments} agent=${flags.enableAiAgent}`);

  const ops = await getJson("/api/health/ops");
  const escrowTotal = ops.body?.opsMetrics?.escrow?.total;
  if (escrowTotal != null) {
    console.log(`  OK /api/health/ops — escrow total=${escrowTotal} (${ops.ms}ms)`);
  } else {
    console.log(`  OK /api/health/ops (${ops.ms}ms)`);
  }

  const sched = await getJson("/api/health/scheduling-config", { required: false });
  if (sched.res.ok) {
    console.log(`  OK /api/health/scheduling-config (${sched.ms}ms)`);
  }

  const failed = checks.filter((c) => c.required && !c.ok);
  if (failed.length) {
    console.error("FAILED:", failed.map((c) => c.path).join(", "));
    process.exit(1);
  }
  console.log(`All ${checks.filter((c) => c.ok).length} staging smoke checks passed.`);
}

main().catch((err) => {
  console.error("staging_smoke failed:", err.message);
  process.exit(1);
});
