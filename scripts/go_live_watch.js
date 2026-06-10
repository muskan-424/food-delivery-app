#!/usr/bin/env node
/**
 * First 60 minutes post go-live monitoring.
 * Usage: node scripts/go_live_watch.js [--base-url URL] [--minutes 60] [--interval 60]
 */
const base = (
  process.argv.includes("--base-url")
    ? process.argv[process.argv.indexOf("--base-url") + 1]
    : process.env.BASE_URL || "http://localhost:4000"
).replace(/\/$/, "");

const minutes = Number(
  process.argv.includes("--minutes")
    ? process.argv[process.argv.indexOf("--minutes") + 1]
    : 60
);
const intervalSec = Number(
  process.argv.includes("--interval")
    ? process.argv[process.argv.indexOf("--interval") + 1]
    : 60
);

async function get(path) {
  const url = `${base}${path}`;
  const start = Date.now();
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    return { status: res.status, text, ms: Date.now() - start };
  } catch (err) {
    return { status: 0, text: String(err.message || err), ms: Date.now() - start };
  }
}

function parse5xx(metricsBody) {
  let total = 0;
  let found = false;
  for (const line of metricsBody.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    if (line.includes("http_request_errors_total") && line.includes('class="5xx"')) {
      found = true;
      const m = line.match(/\}\s+(\d+(?:\.\d+)?)$/);
      if (m) total += Number(m[1]);
    }
  }
  return found ? total : null;
}

async function main() {
  const endAt = Date.now() + minutes * 60 * 1000;
  let sample = 0;
  let healthFails = 0;

  console.log(`Go-live watch: ${base} for ${minutes}m every ${intervalSec}s`);

  while (Date.now() < endAt) {
    sample += 1;
    const ts = new Date().toISOString().slice(11, 19);

    const health = await get("/api/health");
    const healthOk = health.status === 200 && health.text.includes('"success"');
    if (!healthOk) healthFails += 1;

    const ops = await get("/api/health/ops");
    const metrics = await get("/api/health/metrics");
    const fivexx = metrics.status === 200 ? parse5xx(metrics.text) : null;

    console.log(
      `[${ts}] #${sample} health=${healthOk ? "OK" : "FAIL"}(${health.status}) ` +
        `ops=${ops.status} metrics=${metrics.status} ` +
        `5xx_total=${fivexx ?? "n/a"} latency=${health.ms}ms`
    );

    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }

  console.log(`Done. samples=${sample} health_failures=${healthFails}`);
  process.exit(healthFails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("go_live_watch failed:", err.message);
  process.exit(1);
});
