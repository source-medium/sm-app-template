import { defineConfig, devices } from "@playwright/test";
import nextEnv from "@next/env";
import { sampleEnvironment as cleared } from "./scripts/lib/sample-env";

/**
 * End-to-end tests against a production build (`pnpm test:e2e` builds first).
 *
 * - sample / phone: a public sample server.
 * - protected: a sample server behind a test password.
 * - live (opt-in, `pnpm test:live`): environment settings or .env.local against
 *   your real warehouse. It runs real queries, so it never runs by default.
 *
 * The sample servers clear every app variable, so a developer's .env.local
 * (which `next start` would load) cannot leak live settings into them.
 */
const PASSWORD = "e2eOnlyPassword0123456789abcd";
const live = process.env.SM_LIVE_E2E === "1";
if (live) nextEnv.loadEnvConfig(process.cwd(), false, { info: () => undefined, error: console.error });
const [liveUser = "", ...livePassword] = (process.env.APP_BASIC_AUTH ?? "").split(":");
if (live && (!process.env.SM_APP_KEY || !liveUser || !livePassword.join(":"))) {
  throw new Error(
    "Live browser checks need a complete Development app block with APP_BASIC_AUTH in environment settings or .env.local. Run pnpm diagnose first; see docs/cloud.md#debug-with-live-data.",
  );
}

export default defineConfig({
  // Shared checks in e2e/; each view's own tests sit in its feature folder, so deleting a view deletes them.
  testDir: ".",
  testIgnore: ["**/node_modules/**", ".pnpm-store/**", ".next/**", ".open-next/**"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Live traces/HTML reports can retain warehouse rows and Authorization headers.
  reporter: live ? "list" : process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: live ? "off" : "retain-on-failure", screenshot: "off", video: "off" },
  ...(live ? { workers: 1, retries: 0 } : {}),
  projects: live
    ? [
        {
          name: "live",
          testMatch: /e2e\/live\.spec\.ts/,
          use: {
            ...devices["Desktop Chrome"],
            baseURL: "http://127.0.0.1:3108",
            httpCredentials: { username: liveUser, password: livePassword.join(":") },
          },
        },
      ]
    : [
        {
          name: "sample",
          testMatch: [/e2e\/app\.spec\.ts/, /src\/features\/.+\.e2e\.ts/],
          use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3105" },
        },
        {
          name: "phone",
          testMatch: /phone\.spec\.ts/,
          use: { ...devices["Pixel 7"], baseURL: "http://127.0.0.1:3105" },
        },
        {
          name: "protected",
          testMatch: /protected\.spec\.ts/,
          use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3106" },
        },
        {
          name: "fixed-store",
          testMatch: /e2e\/fixed-store\.spec\.ts/,
          use: {
            ...devices["Desktop Chrome"],
            baseURL: "http://127.0.0.1:3109",
            httpCredentials: { username: "viewer", password: PASSWORD },
          },
        },
      ],
  webServer: live
    ? [
        {
          command: "pnpm exec next start --hostname 127.0.0.1 --port 3108",
          url: "http://127.0.0.1:3108/healthz",
          reuseExistingServer: false,
        },
      ]
    : [
        {
          command: "pnpm exec next start --hostname 127.0.0.1 --port 3105",
          url: "http://127.0.0.1:3105/healthz",
          reuseExistingServer: false,
          env: cleared,
        },
        {
          command: "pnpm exec next start --hostname 127.0.0.1 --port 3106",
          url: "http://127.0.0.1:3106/healthz",
          reuseExistingServer: false,
          env: { ...cleared, APP_BASIC_AUTH: `viewer:${PASSWORD}` },
        },
        {
          command: "pnpm exec next start --hostname 127.0.0.1 --port 3109",
          url: "http://127.0.0.1:3109/healthz",
          reuseExistingServer: false,
          env: { ...cleared, APP_BASIC_AUTH: `viewer:${PASSWORD}`, APP_STORE_ID: "sample-store-b" },
        },
      ],
});

export { PASSWORD };
