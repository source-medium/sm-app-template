/**
 * Runs a command with Node's environment proxy turned on in managed
 * development (docs/managed.md#cloud-agents). Cloud coding environments send
 * HTTPS through the proxy named in HTTPS_PROXY, and that proxy is what adds
 * the developer token on Claude Code on the web; Node's fetch ignores the
 * proxy unless NODE_USE_ENV_PROXY=1, so the dev server and `pnpm diagnose`
 * would never reach the data API. Loopback stays direct. TLS verification is
 * never relaxed: the environment's own CA settings (NODE_EXTRA_CA_CERTS)
 * apply unchanged. Without SM_HOSTING=managed-dev, or without a proxy, the
 * command runs exactly as before.
 *
 *   node scripts/managed-node.mjs next dev --hostname 127.0.0.1 --port 3000
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const LOOPBACK = ["localhost", "127.0.0.1", "::1"];
const SERVER_COMMANDS = new Set(["dev", "start"]);
const PROXY_VARIABLES = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"];

/** The environment a managed-development command runs with. Exported for tests. */
export function managedNodeEnvironment(env, hosting) {
  if (hosting !== "managed-dev" || !PROXY_VARIABLES.some((name) => env[name])) return env;
  const noProxy = new Set(
    `${env.NO_PROXY ?? ""},${env.no_proxy ?? ""}`
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  for (const host of LOOPBACK) noProxy.add(host);
  const list = [...noProxy].join(",");
  return { ...env, NODE_USE_ENV_PROXY: "1", NO_PROXY: list, no_proxy: list };
}

/**
 * Why a Next server may not start in managed development, or null. The bind
 * address is the real "this computer only" boundary: a request's Host and
 * Origin headers (checked again in src/lib/auth/loopback.ts) are the
 * client's to write. Next listens on every interface unless told otherwise.
 */
export function managedServerBindingRefusal(command, args, hosting) {
  if (hosting !== "managed-dev" || command !== "next" || !SERVER_COMMANDS.has(args[0])) return null;
  const inline = args.find((arg) => arg.startsWith("--hostname="));
  const flag = args.findIndex((arg) => arg === "--hostname" || arg === "-H");
  const host = inline ? inline.slice("--hostname=".length) : flag >= 0 ? args[flag + 1] : undefined;
  return host && LOOPBACK.includes(host)
    ? null
    : "Managed development serves only this computer: start Next with --hostname 127.0.0.1 (`pnpm dev` does). The developer token must not be reachable from another machine.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error("Usage: node scripts/managed-node.mjs <command> [args...]");
    process.exit(2);
  }
  // Read SM_HOSTING the way `next dev` would, without handing the child a
  // pre-loaded copy of .env.local: Next still loads and reloads it itself.
  const inherited = { ...process.env };
  const { combinedEnv } = nextEnv.loadEnvConfig(join(import.meta.dirname, ".."), true, {
    info: () => undefined,
    error: console.error,
  });
  const hosting = combinedEnv.SM_HOSTING?.trim();
  const refusal = managedServerBindingRefusal(command, args, hosting);
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
  // Verified to route fetch through the proxy on Node 22.22.1 (the engines
  // floor), 24.7 and 26; Node 22.16 ignores it.
  const env = managedNodeEnvironment(inherited, hosting);
  const child = spawn(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
