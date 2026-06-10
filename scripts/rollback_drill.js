#!/usr/bin/env node
/**
 * Staging rollback drill helper.
 * Usage: node scripts/rollback_drill.js [--base-url URL] [--previous-tag vX]
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

const baseUrl = (arg("--base-url", process.env.BASE_URL) || "http://localhost:4000").replace(
  /\/$/,
  ""
);
const previousTag = arg("--previous-tag", "v0.9.0-staging");
const root = path.join(__dirname, "..");

function runSmoke() {
  console.log(`Running staging smoke against ${baseUrl}`);
  const r = spawnSync("node", ["scripts/staging_smoke.js", baseUrl], {
    cwd: path.join(root, "backend"),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return r.status ?? 1;
}

function printPlaybook() {
  console.log("\n--- Rollback playbook ---");
  console.log("1. Announce rollback to release + rollback owners.");
  console.log("2. docker compose -f docker-compose.yml -f docker-compose.staging.yml down");
  console.log(`3. git checkout ${previousTag}`);
  console.log("4. Restore previous env snapshot if secrets changed.");
  console.log("5. docker compose -f docker-compose.yml -f docker-compose.staging.yml up --build -d");
  console.log("6. cd backend && npm run migrate:status");
  console.log("7. npm run smoke:staging");
  console.log("8. node scripts/go_live_watch.js --minutes 5 --interval 30");
  console.log("--- end ---\n");
}

const smokeCode = runSmoke();
printPlaybook();

if (argv.includes("--verify-after")) {
  console.log("(Dry-run) Re-run smoke after rollback manually.");
}

process.exit(smokeCode === 0 ? 0 : 1);
