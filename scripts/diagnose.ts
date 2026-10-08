/**
 * pnpm diagnose (the doctor): checks configuration and, with a complete live
 * configuration,
 * the warehouse. Prints one status line naming the mode and guard, never a
 * credential. Sample mode makes no Google call. `--offline` (used by
 * `pnpm dev`) stops after the configuration check. `--dev-vars` (used by
 * `pnpm preview`) checks `.dev.vars`, the only file the Worker preview reads,
 * instead of the Next environment, and is always offline.
 */
import { execFileSync } from "node:child_process";
import { describeConfig, parseConfig } from "../src/lib/config/env.server";
import { warehouseFor } from "../src/lib/data/warehouse.server";
import { connectionReportText } from "../src/lib/data/connection-report";
import { setLogEmitter } from "../src/lib/data/log";
import { loadLocalEnvironment, readDevVars, root } from "./lib/environment";

const devVars = process.argv.includes("--dev-vars");
const offline = devVars || process.argv.includes("--offline");
const ok = (message: string) => console.log(`  ✓ ${message}`);
const fail = (message: string) => console.error(`  ✗ ${message}`);

function trackedEnvFiles(): string[] | null {
  try {
    const output = execFileSync("git", ["ls-files", "-z", "--", ".env*", ".dev.vars*"], {
      cwd: root,
      encoding: "utf8",
    });
    return output.split("\0").filter((file) => file && file !== ".env.example");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const vars = devVars ? readDevVars() : null;
  if (!devVars) loadLocalEnvironment();
  const config = parseConfig(devVars ? (vars ?? {}) : process.env);
  console.log(`SourceMedium app${devVars ? " (Worker preview, from .dev.vars)" : ""}: ${describeConfig(config)}`);

  const tracked = trackedEnvFiles();
  if (tracked && tracked.length > 0) {
    fail(
      `${tracked.join(", ")} ${tracked.length === 1 ? "is" : "are"} tracked by git; remove with \`git rm --cached <file>\` and rotate any secret it held.`,
    );
    process.exit(1);
  }

  if (config.status === "error") {
    for (const problem of config.problems) fail(problem.message);
    console.error(
      devVars
        ? "Fix .dev.vars (the Worker preview reads it, not .env.local), then run `pnpm preview` again. See docs/connect.md#test-the-worker-locally."
        : "Fix your environment settings (or .env.local for local development), then run `pnpm diagnose` again. See docs/cloud.md#debug-with-live-data.",
    );
    process.exit(1);
  }
  if (devVars && !vars) {
    ok(
      "No .dev.vars file, so the Worker preview serves sample data. Paste the configuration block into .dev.vars to preview live data.",
    );
  }
  if (offline) return;

  if (tracked) ok("No secrets tracked in git");
  if (config.mode === "sample") {
    ok(
      "Sample mode makes no warehouse calls. For live debugging, enter a Development app block privately in environment settings (docs/cloud.md#debug-with-live-data), or .env.local for local development.",
    );
    return;
  }
  setLogEmitter(() => undefined);
  const report = await warehouseFor(config.live, config.storeId).checkConnection();
  console.log(connectionReportText(report));
  const healthy = !report.checks.some((check) => check.status === "fail");
  console.log(healthy ? "All checks passed." : "Some checks failed; see docs/operations.md for remedies.");
  if (!healthy) process.exit(1);
}

await main();
