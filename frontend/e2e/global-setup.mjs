import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../backend");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

export function e2eBackendEnv() {
  const fileEnv = loadDotEnv(path.join(backendDir, ".env"));
  return {
    ...fileEnv,
    ...process.env,
    NODE_ENV: "test",
    PORT: process.env.PLAYWRIGHT_API_PORT || fileEnv.PORT || "4000",
    MONGO_URL:
      process.env.MONGO_URL ||
      fileEnv.MONGO_URL ||
      "mongodb://127.0.0.1:27017/food-delivery-e2e",
    JWT_SECRET:
      process.env.JWT_SECRET ||
      fileEnv.JWT_SECRET ||
      "e2e-test-secret-do-not-use-in-production",
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET ||
      fileEnv.JWT_REFRESH_SECRET ||
      "e2e-test-refresh-secret",
    ENABLE_JOB_QUEUE: "false",
    ENABLE_SCHEDULED_JOBS: "false",
    ENABLE_AI_AGENT: "true",
    USE_MOCK_AGENT: "true",
    ENABLE_ORDER_CHAT: "true",
    ENABLE_EMAIL_OTP: "false",
    ENCRYPTION_KEY:
      process.env.ENCRYPTION_KEY ||
      fileEnv.ENCRYPTION_KEY ||
      "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
  };
}

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_SKIP_MIGRATE === "1") return;
  try {
    execSync("node scripts/migrate.js up", {
      cwd: backendDir,
      stdio: "inherit",
      env: e2eBackendEnv(),
    });
  } catch (err) {
    if (process.env.PLAYWRIGHT_SKIP_MIGRATE === "1") return;
    console.warn("[e2e] migrate skipped or failed:", err?.message || err);
  }
}
