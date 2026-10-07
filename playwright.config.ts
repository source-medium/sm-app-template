import { defineConfig, devices } from "@playwright/test";
import nextEnv from "@next/env";

/**
 * End-to-end tests against a production build (`pnpm test:e2e` builds first).
 *
 * - sample / phone: a public sample server.
 * - protected: a sample server behind a test password.
 * - live (opt-in, `pnpm test:live`): your .env.local configuration against
 *   your real warehouse. It runs real queries, so it never runs by default.
 *
 * The sample servers clear every app variable, so a developer's .env.local
 * (which `next start` would load) cannot leak live settings into them.
 */
const PASSWORD = "e2eOnlyPassword0123456789abcd";
const APP_VARIABLES = [
  "SM_APPLICATION_ID",
  "SM_APP_KEY",
  "BIGQUERY_JOB_PROJECT_ID",
  "BIGQUERY_LOCATION",
  "SM_DATA_PROJECT_ID",
  "SM_TRANSFORMED_DATASET_ID",
  "SM_METADATA_DATASET_ID",
  "APP_BASIC_AUTH",
  "APP_STORE_ID",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
  "BIGQUERY_MAX_BYTES_BILLED",
];
const cleared = Object.fromEntries(APP_VARIABLES.map((name) => [name, ""]));

const live = process.env.SM_LIVE_E2E === "1";
if (live) nextEnv.loadEnvConfig(process.cwd(), false, { info: () => undefined, error: console.error });
const [liveUser = "", ...livePassword] = (process.env.APP_BASIC_AUTH ?? "").split(":");

export default defineConfig({
  // Shared checks in e2e/; each view's own tests sit in its feature folder, so deleting a view deletes them.
  testDir: ".",
  testIgnore: ["**/node_modules/**", ".next/**", ".open-next/**"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
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
