/** Loads .env files the way `next dev` does, so scripts see the same configuration as the app. */
import nextEnv from "@next/env";
import { join } from "node:path";

export const root = join(import.meta.dirname, "..", "..");

export function loadLocalEnvironment(): void {
  nextEnv.loadEnvConfig(root, true, { info: () => undefined, error: console.error });
}
