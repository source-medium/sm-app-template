/** `pnpm signin`: see scripts/lib/signin.ts and docs/managed.md#local-development. */
import { spawn } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { SELF_HOSTED_VARIABLES } from "../src/lib/config/env.server";
import { signIn, sourceMediumOrigin, withManagedDevValues } from "./lib/signin";

function openBrowser(url: string) {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  // No browser (a remote shell): the printed link is the way in.
  spawn(command, args, { stdio: "ignore", detached: true })
    .on("error", () => undefined)
    .unref();
}

try {
  const origin = sourceMediumOrigin(process.env.SOURCEMEDIUM_URL);
  const result = await signIn({ origin, client: hostname(), openBrowser, log: (line) => console.log(line), fetch });
  const file = ".env.local";
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeFileSync(
    file,
    withManagedDevValues(
      before,
      { SM_HOSTING: "managed-dev", SM_DATA_API_URL: result.dataApiUrl, SM_DEVELOPER_TOKEN: result.token },
      SELF_HOSTED_VARIABLES,
    ),
    { mode: 0o600 },
  );
  chmodSync(file, 0o600);
  const until = new Date(result.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" });
  console.log(
    `\nSigned in to ${result.app.name} in ${result.workspace.name}. The sign-in lasts until ${until}; run pnpm signin again then.` +
      `\nSaved to .env.local (git-ignored). Next: pnpm diagnose, then pnpm dev.`,
  );
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
