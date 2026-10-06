import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Absolute path with forward slashes: Vite's alias matching needs them on Windows too. */
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url)).replace(/\\/g, "/");

const resolve = {
  alias: {
    "@/app.config": path("./app.config.ts"),
    "@/": path("./src/"),
    "server-only": path("./tests/helpers/empty-module.ts"),
  },
};

// The invariant tests run twice: in Node and in workerd, the runtime Cloudflare deploys.
const INVARIANTS = ["tests/invariants/**/*.test.ts"];

export default defineConfig({
  resolve,
  test: {
    projects: [
      {
        resolve,
        test: {
          name: "node",
          testTimeout: 30_000,
          environment: "node",
          include: [...INVARIANTS, "tests/unit/**/*.test.ts", "tests/static/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        resolve,
        plugins: [react()],
        test: {
          name: "dom",
          testTimeout: 30_000,
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/helpers/setup-dom.ts"],
        },
      },
      {
        resolve,
        plugins: [
          cloudflareTest({
            miniflare: { compatibilityDate: "2026-06-30", compatibilityFlags: ["nodejs_compat"] },
          }),
        ],
        test: { name: "workerd", include: INVARIANTS, testTimeout: 30_000 },
      },
    ],
  },
});
