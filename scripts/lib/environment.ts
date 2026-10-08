/** Loads .env files the way `next dev` does, so scripts see the same configuration as the app. */
import nextEnv from "@next/env";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const root = join(import.meta.dirname, "..", "..");

export function loadLocalEnvironment(): void {
  nextEnv.loadEnvConfig(root, true, { info: () => undefined, error: console.error });
}

/** KEY=value lines in dotenv style: optional export prefix and quotes, no interpolation. */
export function parseDotenv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\n]*)["']?\s*$/.exec(line);
    if (match?.[1]) values[match[1]] = match[2]?.trim() ?? "";
  }
  return values;
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
    if (name === "SM_APP_KEY") values.push(value, value.slice(40, 120));
    if (name === "APP_BASIC_AUTH") values.push(value, value.slice(value.indexOf(":") + 1));
  };
  add("SM_APP_KEY", env.SM_APP_KEY);
  add("APP_BASIC_AUTH", env.APP_BASIC_AUTH);
  for (const file of readdirSync(directory).filter((name) => name.startsWith(".env") && name !== ".env.example")) {
    for (const [name, value] of Object.entries(parseDotenv(readFileSync(join(directory, file), "utf8")))) {
      add(name, value);
    }
  }
  // Short fragments would match by chance; a real key or generated password is far longer.
  return [...new Set(values.filter((value) => value.length >= 16))];
}
