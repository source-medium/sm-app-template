/** Reuse the live browser suite against a deployed commit. Never load dotenv or build locally. */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length !== 2 && !(args.length === 4 && args[2] === "--grep" && args[3].trim())) {
  console.error(
    "Usage: pnpm test:hosted <https-origin> <full-git-commit> [--grep <test-title-pattern>]. Enter APP_BASIC_AUTH privately in environment settings first.",
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [createRequire(import.meta.url).resolve("@playwright/test/cli"), "test", ...args.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, SM_HOSTED_E2E: "1", SM_HOSTED_URL: args[0], SM_EXPECTED_COMMIT: args[1] },
  },
);
if (result.error) console.error("Could not start hosted browser checks. Run node scripts/setup-agent.mjs first.");
process.exit(result.status ?? 1);
