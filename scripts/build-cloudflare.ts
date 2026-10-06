/**
 * pnpm build:cloudflare: the OpenNext build, minus local secrets.
 *
 * OpenNext copies values from .env, .env.local, and .env.<mode>[.local] into
 * the Worker (.open-next/cloudflare/next-env.mjs) and fills any missing
 * runtime variable from them. A laptop build would therefore ship the app
 * key inside the Worker, and a secret later removed from the host would
 * silently come back. This app reads configuration only from runtime
 * bindings, so the file is emptied after every build and then verified.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localSecretValues, root } from "./lib/environment";

const ENV_MODULE = join(root, ".open-next/cloudflare/next-env.mjs");

const build = spawnSync("pnpm", ["exec", "opennextjs-cloudflare", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(ENV_MODULE)) {
  console.error(
    "OpenNext did not write .open-next/cloudflare/next-env.mjs; check the adapter version before deploying, since this script must empty it.",
  );
  process.exit(1);
}
writeFileSync(ENV_MODULE, "export const production = {};\nexport const development = {};\nexport const test = {};\n");
// Next standalone copies .env and .env.production beside each server function; workerd never reads them.
const FUNCTIONS = join(root, ".open-next/server-functions");
for (const fn of readdirSync(FUNCTIONS)) {
  for (const name of readdirSync(join(FUNCTIONS, fn))) if (name.startsWith(".env")) rmSync(join(FUNCTIONS, fn, name));
}

// Verify: no secret value from any local env file appears anywhere in the Worker output.
const secrets = localSecretValues();
function scan(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return scan(path);
    const text = readFileSync(path, "latin1");
    return secrets.some((secret) => text.includes(secret)) ? [path] : [];
  });
}
const leaks = secrets.length > 0 ? scan(join(root, ".open-next")) : [];
if (leaks.length > 0) {
  console.error(
    `A local secret appears in the Worker build (${leaks.map((path) => path.slice(root.length + 1)).join(", ")}); do not deploy this build. Report it as a template bug.`,
  );
  process.exit(1);
}
console.log("Worker built without local env values; configuration comes only from runtime variables.");
