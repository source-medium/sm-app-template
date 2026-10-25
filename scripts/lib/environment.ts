/** Loads .env files the way `next dev` does, so scripts see the same configuration as the app. */
import nextEnv from "@next/env";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

export const root = join(import.meta.dirname, "..", "..");

export function loadLocalEnvironment(): void {
  nextEnv.loadEnvConfig(root, true, { info: () => undefined, error: console.error });
}

/**
 * KEY=value lines in dotenv style (Node's `parseEnv`): optional export prefix
 * and quotes, inline comments, no interpolation. A leading byte-order mark, as
 * some Windows editors write, is dropped as dotenv and Wrangler drop it.
 */
export function parseDotenv(text: string): Record<string, string> {
  return { ...parseEnv(text.replace(/^\uFEFF/, "")) } as Record<string, string>;
}

/**
 * The runtime values a local Worker preview serves: `.dev.vars` alone, as
 * `wrangler dev` reads it, never `.env.local`. Null when the file is absent.
 */
export function readDevVars(directory = root): Record<string, string> | null {
  const path = join(directory, ".dev.vars");
  return existsSync(path) ? parseDotenv(readFileSync(path, "utf8")) : null;
}

/**
 * Secret values in injected environment settings and this checkout's local
 * env files, for build scans to look for. Never print them. Scan both sources
 * even when an injected variable overrides a local file at runtime.
 */
export function configuredSecretValues(
  directory = root,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const values: string[] = [];
  const add = (name: string, value: string | undefined) => {
    if (!value) return;
    if (name === "SM_APP_KEY" || name === "SM_CONNECTION") values.push(value, value.slice(40, 120));
    if (name === "SM_CONNECTION") {
      try {
        const bundle = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
        if (typeof bundle?.values?.SM_APP_KEY === "string") add("SM_APP_KEY", bundle.values.SM_APP_KEY);
      } catch {
        // Malformed configuration is still scanned verbatim above; runtime validation reports it.
      }
    }
    if (name === "APP_BASIC_AUTH") values.push(value, value.slice(value.indexOf(":") + 1));
    if (name === "SM_DEVELOPER_TOKEN") values.push(value);
  };
  add("SM_APP_KEY", env.SM_APP_KEY);
  add("SM_CONNECTION", env.SM_CONNECTION);
  add("APP_BASIC_AUTH", env.APP_BASIC_AUTH);
  add("SM_DEVELOPER_TOKEN", env.SM_DEVELOPER_TOKEN);
  for (const file of readdirSync(directory).filter((name) => name.startsWith(".env") && name !== ".env.example")) {
    for (const [name, value] of Object.entries(parseDotenv(readFileSync(join(directory, file), "utf8")))) {
      add(name, value);
    }
  }
  // Short fragments would match by chance; a real key or generated password is far longer.
  return [...new Set(values.filter((value) => value.length >= 16))];
}

/**
 * Every file under a build output `dir`, for the secret scans. Follows symlinks, as
 * bundlers do (OpenNext links its pnpm packages). Empty when `dir` is absent.
 */
export function buildFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? buildFiles(path) : [path];
  });
}
