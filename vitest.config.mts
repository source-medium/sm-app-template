import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolve = {
  alias: {
    "@/app.config": fileURLToPath(new URL("./app.config.ts", import.meta.url)),
    "@/": fileURLToPath(new URL("./src/", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/helpers/empty-module.ts", import.meta.url)),
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
          environment: "node",
          include: [...INVARIANTS, "tests/unit/**/*.test.ts", "tests/static/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        resolve,
        plugins: [react()],
        test: {
          name: "dom",
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
        test: { name: "workerd", include: INVARIANTS },
      },
    ],
  },
});
