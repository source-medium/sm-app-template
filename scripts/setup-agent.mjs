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

function pnpm(...args) {
  // The temporary executable environment exposes the pinned pnpm to nested
  // package scripts without replacing the machine's package manager.
  const result = spawnSync("npm", ["exec", "--yes", `--package=${pkg.packageManager}`, "--", "pnpm", ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) {
    console.error("Agent setup failed. Check the command above and docs/cloud.md#setup-help, then rerun setup.");
    process.exit(result.status || 1);
  }
}

pnpm("install", "--frozen-lockfile");
const { chromium } = createRequire(import.meta.url)("@playwright/test");
// A cached executable alone does not prove the headless shell and OS libraries
// are installed. Exercise the browser the tests actually use before skipping setup.
async function checkBrowser() {
  const browser = await chromium.launch();
  await browser.close();
}
try {
  await checkBrowser();
} catch {
  pnpm("exec", "playwright", "install", "chromium");
  try {
    await checkBrowser();
  } catch (error) {
    if (process.platform !== "linux") throw error;
    // A browser download needs no root access. Only try the system-library
    // installer when the downloaded browser still cannot launch.
    pnpm("exec", "playwright", "install-deps", "chromium");
    await checkBrowser();
  }
}
console.log("Agent setup ready. Follow sm-cloud for first setup, then protected previews on your actual data.");
