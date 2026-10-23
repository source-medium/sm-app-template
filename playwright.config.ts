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
const hosted = process.env.SM_HOSTED_E2E === "1";
const live = hosted || process.env.SM_LIVE_E2E === "1";
let liveURL = "http://127.0.0.1:3108";
if (hosted) {
  const invalidTarget = "Hosted checks need an HTTPS origin without credentials, a path, query, or fragment.";
  let target: URL;
  try {
    target = new URL(process.env.SM_HOSTED_URL ?? "");
  } catch {
    throw new Error(invalidTarget);
  }
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error(invalidTarget);
  }
  liveURL = target.origin;
  if (!/^[a-f0-9]{40}$/.test(process.env.SM_EXPECTED_COMMIT ?? "")) {
    throw new Error("Hosted checks need the full 40-character Git commit expected on this deployment.");
  }
}
// A managed app's previews sit behind SourceMedium sign-in, which a Basic Auth browser cannot pass.
if (hosted && ["managed", "managed-dev"].includes(process.env.SM_HOSTING?.trim() ?? "")) {
  throw new Error(
    "Apps SourceMedium hosts are not checked with pnpm test:hosted. Run pnpm test:live against your data instead; see docs/managed.md.",
  );
}
if (live && !hosted) nextEnv.loadEnvConfig(process.cwd(), false, { info: () => undefined, error: console.error });
// Managed development reads through SourceMedium's data API and serves only
// this computer, so the live server needs no Basic Auth (docs/managed.md).
const managedDev = live && !hosted && process.env.SM_HOSTING?.trim() === "managed-dev";
if (managedDev && !process.env.SM_DATA_API_URL) {
  throw new Error("Managed live checks need SM_DATA_API_URL. Run pnpm diagnose first; see docs/managed.md.");
}
const [liveUser = "", ...livePassword] = (process.env.APP_BASIC_AUTH ?? "").split(":");
if (hosted && (!liveUser || !livePassword.join(":"))) {
  throw new Error(
    "Hosted checks need APP_BASIC_AUTH entered privately in the agent environment. No warehouse key or .env file is needed. For Cloudflare Access, use the manual checks in docs/cloud.md#verify-a-hosted-build.",
  );
}
if (
  live &&
  !hosted &&
  !managedDev &&
  ((!process.env.SM_CONNECTION && !process.env.SM_APP_KEY) || !liveUser || !livePassword.join(":"))
) {
  throw new Error(
    "Live browser checks need a complete Development app block with APP_BASIC_AUTH in environment settings or .env.local. Run pnpm diagnose first; see docs/cloud.md#debug-with-live-data.",
  );
}

export default defineConfig({
  // Shared checks in e2e/; each view's own tests sit in its feature folder, so deleting a view deletes them.
  testDir: ".",
  outputDir: process.env.SM_TEST_OUTPUT_DIR ?? "test-results",
  // An agent worktree under .claude/ is a second checkout with its own node_modules.
  testIgnore: ["**/node_modules/**", ".pnpm-store/**", ".next/**", ".open-next/**", "**/.claude/worktrees/**"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Live traces/HTML reports can retain warehouse rows and Authorization headers.
  reporter: live
    ? "list"
    : process.env.CI
      ? [[process.env.GITHUB_ACTIONS ? "github" : "list"], ["html", { open: "never" }]]
      : "list",
  use: { trace: live ? "off" : "retain-on-failure", screenshot: "off", video: "off" },
  ...(live ? { workers: 1, retries: 0, preserveOutput: "never" as const } : {}),
  ...(hosted ? { globalSetup: "./e2e/hosted.setup.ts" } : {}),
  projects: live
    ? [
        {
          name: "live",
          testMatch: /e2e\/live\.spec\.ts/,
          // A click or filter waits on real warehouse queries before the URL or page settles.
          expect: { timeout: 30_000 },
          use: {
            ...devices["Desktop Chrome"],
            baseURL: liveURL,
            ...(managedDev
              ? {}
              : { httpCredentials: { username: liveUser, password: livePassword.join(":"), origin: liveURL } }),
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
  webServer: hosted
    ? []
    : live
      ? [
          {
            // The wrapper sends a cloud environment's HTTPS through its proxy, as `pnpm dev` does.
            command: managedDev
              ? "node scripts/managed-node.mjs next start --hostname 127.0.0.1 --port 3108"
              : "pnpm exec next start --hostname 127.0.0.1 --port 3108",
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
