/** Shared bootstrap for hosted coding agents. No credentials or global installs. */
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Repository hooks also run locally. Leave local Claude sessions untouched.
const claudeHook = process.argv.includes("--claude-hook");
if (claudeHook && process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0);

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const minimum = pkg.engines.node.replace(/^>=/, "").split(".").map(Number);
const current = process.versions.node.split(".").map(Number);
const firstDifference = current.findIndex((part, index) => part !== minimum[index]);
if (firstDifference !== -1 && current[firstDifference] < minimum[firstDifference]) {
  // Claude's image can lag our dependencies. Use an npm-cached runtime only
  // in its cloud hook; do not replace the person's local Node installation.
  if (claudeHook && !process.argv.includes("--runtime-retry")) {
    const result = spawnSync(
      "npm",
      [
        "exec",
        "--yes",
        "--package=node@24",
        "--",
        "node",
        fileURLToPath(import.meta.url),
        "--claude-hook",
        "--runtime-retry",
      ],
      {
        cwd: root,
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
    if (result.error || result.status !== 0)
      console.error(
        "Cloud setup with Node 24 did not finish. Follow the command error above; see docs/cloud.md#setup-help.",
      );
    process.exit(result.status ?? 1);
  }
  console.error(`Use Node ${pkg.engines.node} (Node 24 recommended), then rerun node scripts/setup-agent.mjs.`);
  process.exit(1);
}
// Claude sources this file for later shell commands, so pnpm check uses the
// same runtime as installation, including after a resumed session.
if (claudeHook && process.env.CLAUDE_ENV_FILE) {
  const nodeBin = dirname(process.execPath).replaceAll("'", "'\\''");
  appendFileSync(process.env.CLAUDE_ENV_FILE, `export PATH='${nodeBin}':"$PATH"\n`);
}

/** Runs the pinned pnpm and returns its exit status (1 when it cannot start). */
function runPnpm(...args) {
  // The temporary executable environment exposes the pinned pnpm to nested
  // package scripts without replacing the machine's package manager.
  const result = spawnSync("npm", ["exec", "--yes", `--package=${pkg.packageManager}`, "--", "pnpm", ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
    shell: process.platform === "win32",
  });
  return result.error ? 1 : (result.status ?? 1);
}

function pnpm(...args) {
  const status = runPnpm(...args);
  if (status !== 0) {
    console.error("Agent setup failed. Check the command above and docs/cloud.md#setup-help, then rerun setup.");
    process.exit(status);
  }
}

pnpm("install", "--frozen-lockfile");
const { chromium } = createRequire(import.meta.url)("@playwright/test");
// A cached executable alone does not prove the headless shell and OS libraries
// are installed. Exercise the browser the tests actually use before skipping setup.
let browserError;
async function browserWorks() {
  try {
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch (error) {
    browserError = error;
    return false;
  }
}
let browserReady = await browserWorks();
if (!browserReady && runPnpm("exec", "playwright", "install", "chromium") === 0) {
  browserReady = await browserWorks();
  // A browser download needs no root access. Only try the system-library
  // installer when the downloaded browser still cannot launch.
  if (!browserReady && process.platform === "linux" && runPnpm("exec", "playwright", "install-deps", "chromium") === 0)
    browserReady = await browserWorks();
}
if (!browserReady) {
  console.warn(
    `Agent setup ready without a test browser (${String(browserError?.message ?? browserError).split("\n")[0]}). pnpm check and pnpm dev work; browser tests need Chromium. Allow the browser download (docs/cloud.md#setup-help), then run pnpm exec playwright install chromium.`,
  );
}
console.log("Agent setup ready. Follow sm-cloud for first setup, then protected previews on your actual data.");
