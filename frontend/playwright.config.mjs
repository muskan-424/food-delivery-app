import { defineConfig, devices } from "@playwright/test";
import { e2eBackendEnv } from "./e2e/global-setup.mjs";

const API_PORT = process.env.PLAYWRIGHT_API_PORT || "4000";
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT || "5173";
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const WEB_BASE = `http://127.0.0.1:${WEB_PORT}`;

const backendEnv = e2eBackendEnv();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: WEB_BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./e2e/global-setup.mjs",
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: "node server.js",
          cwd: "../backend",
          url: `${API_BASE}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: backendEnv,
        },
        {
          command: `npm run dev -- --host 127.0.0.1 --port ${WEB_PORT}`,
          url: WEB_BASE,
          reuseExistingServer: !process.env.CI,
          timeout: process.env.CI ? 180_000 : 300_000,
          env: {
            VITE_API_URL: API_BASE,
          },
        },
      ],
});
