/** Shared bootstrap for hosted coding agents. No credentials or global installs. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Repository hooks also run locally. Leave local Claude sessions untouched.
if (process.argv.includes("--claude-hook") && process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0);

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const minimum = pkg.engines.node.replace(/^>=/, "").split(".").map(Number);
const current = process.versions.node.split(".").map(Number);
const firstDifference = current.findIndex((part, index) => part !== minimum[index]);
if (firstDifference !== -1 && current[firstDifference] < minimum[firstDifference]) {
  console.error(`Use Node ${pkg.engines.node} (Node 24 recommended), then rerun node scripts/setup-agent.mjs.`);
  process.exit(1);
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
  pnpm("exec", "playwright", "install", ...(process.platform === "linux" ? ["--with-deps"] : []), "chromium");
  await checkBrowser();
}
console.log("Agent setup ready. Follow the sm-cloud skill for a sample preview; no warehouse credential is needed.");
