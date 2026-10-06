/** Loads .env files the way `next dev` does, so scripts see the same configuration as the app. */
import nextEnv from "@next/env";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const root = join(import.meta.dirname, "..", "..");

export function loadLocalEnvironment(): void {
  nextEnv.loadEnvConfig(root, true, { info: () => undefined, error: console.error });
}

/**
 * The secret values (SM_APP_KEY, the Basic password) in this checkout's local
 * env files, for build scans to look for. Never print them.
 */
export function localSecretValues(): string[] {
  const values: string[] = [];
  for (const file of readdirSync(root).filter((name) => name.startsWith(".env") && name !== ".env.example")) {
    for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?([^"'\n]+)["']?\s*$/.exec(line);
      const value = match?.[2]?.trim();
      if (!value) continue;
      if (match?.[1] === "SM_APP_KEY") values.push(value, value.slice(40, 120));
      if (match?.[1] === "APP_BASIC_AUTH") values.push(value, value.slice(value.indexOf(":") + 1));
    }
  }
  // Short fragments would match by chance; a real key or generated password is far longer.
  return values.filter((value) => value.length >= 16);
}
