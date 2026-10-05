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
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib/environment";

const ENV_MODULE = join(root, ".open-next/cloudflare/next-env.mjs");
const SECRET_NAMES = ["SM_APP_KEY", "APP_BASIC_AUTH"];

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

// Verify: no secret value from any local env file appears anywhere in the Worker output.
const secrets: string[] = [];
for (const file of readdirSync(root).filter((name) => name.startsWith(".env") && name !== ".env.example")) {
  for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?([^"'\n]+)["']?\s*$/.exec(line);
    if (match?.[1] && match[2] && SECRET_NAMES.includes(match[1])) secrets.push(match[2].trim());
  }
}
function scan(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return scan(path);
    const text = readFileSync(path, "latin1");
    return secrets.some((secret) => secret.length >= 16 && text.includes(secret)) ? [path] : [];
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
