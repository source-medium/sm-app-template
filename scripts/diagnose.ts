/**
 * pnpm diagnose (the doctor): checks configuration and, with a complete live
 * configuration,
 * the warehouse. Prints one status line naming the mode and guard, never a
 * credential. Sample mode makes no Google call. `--offline` (used by
 * `pnpm dev`) stops after the configuration check.
 */
import { execFileSync } from "node:child_process";
import { describeConfig, parseConfig } from "../src/lib/config/env.server";
import { warehouseFor } from "../src/lib/data/warehouse.server";
import { connectionReportText } from "../src/lib/data/connection-report";
import { setLogEmitter } from "../src/lib/data/log";
import { loadLocalEnvironment, root } from "./lib/environment";

const offline = process.argv.includes("--offline");
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
  loadLocalEnvironment();
  const config = parseConfig(process.env);
  console.log(`SourceMedium app: ${describeConfig(config)}`);

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
      "Fix your environment settings (or .env.local for local development), then run `pnpm diagnose` again. See docs/cloud.md#debug-with-live-data.",
    );
    process.exit(1);
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
