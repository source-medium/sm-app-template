import { defineConfig, devices } from "@playwright/test";

/**
 * Sample-mode end-to-end tests against a production build (`pnpm test:e2e`
 * builds first). Two servers from the same build: a public sample and a
 * sample protected by the shared password. No credentials or network.
 */
const PASSWORD = "e2eOnlyPassword0123456789abcd";

export default defineConfig({
  // Shared checks in e2e/; each view's own tests sit in its feature folder, so deleting a view deletes them.
  testDir: ".",
  testIgnore: ["**/node_modules/**", ".next/**", ".open-next/**"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "sample",
      testMatch: [/e2e\/app\.spec\.ts/, /src\/features\/.+\.e2e\.ts/],
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3105" },
    },
    { name: "phone", testMatch: /phone\.spec\.ts/, use: { ...devices["Pixel 7"], baseURL: "http://127.0.0.1:3105" } },
    {
      name: "protected",
      testMatch: /protected\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3106" },
    },
  ],
  webServer: [
    {
      command: "pnpm exec next start --hostname 127.0.0.1 --port 3105",
      url: "http://127.0.0.1:3105/healthz",
      reuseExistingServer: false,
      env: { APP_BASIC_AUTH: "", SM_APP_KEY: "" },
    },
    {
      command: "pnpm exec next start --hostname 127.0.0.1 --port 3106",
      url: "http://127.0.0.1:3106/healthz",
      reuseExistingServer: false,
      env: { APP_BASIC_AUTH: `viewer:${PASSWORD}`, SM_APP_KEY: "" },
    },
  ],
});

export { PASSWORD };
