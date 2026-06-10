#!/usr/bin/env node
/**
 * Lightweight concurrent health load smoke (Phase Z).
 * Usage: node scripts/smoke_load.js [baseUrl] [concurrency]
 */
const base = (process.argv[2] || process.env.BASE_URL || "http://localhost:4000").replace(
  /\/$/,
  ""
);
const n = Math.min(200, Math.max(1, Number(process.argv[3]) || 20));
const url = `${base}/api/health`;

async function getOnce(i) {
  const start = Date.now();
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const ms = Date.now() - start;
  if (!res.ok) throw new Error(`#${i} ${res.status} in ${ms}ms`);
  return ms;
}

async function main() {
  console.log(`Load smoke: ${n} concurrent GET ${url}`);
  const started = Date.now();
  const times = await Promise.all(Array.from({ length: n }, (_, i) => getOnce(i + 1)));
  const elapsed = Date.now() - started;
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const max = Math.max(...times);
  console.log(`Done ${n} requests in ${elapsed}ms (avg ${avg}ms, max ${max}ms)`);
}

main().catch((err) => {
  console.error("smoke_load failed:", err.message);
  process.exit(1);
});
