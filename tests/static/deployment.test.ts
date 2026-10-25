import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConfig } from "@/lib/config/env.server";
import pkg from "../../package.json";
import { readWorkerConfig } from "../../scripts/lib/setup";

const config = readWorkerConfig(readFileSync("wrangler.jsonc", "utf8")) as ReturnType<typeof readWorkerConfig> & {
  compatibility_date: string;
  compatibility_flags: string[];
  preview_urls: boolean;
  env: { preview: { vars: Record<string, string>; previews: { vars: Record<string, string> } } };
};

describe("hosted preview configuration", () => {
  it("requires live data for both the preview Worker and its branch previews", () => {
    for (const vars of [config.env.preview.vars, config.env.preview.previews.vars]) {
      expect(vars.APP_REQUIRE_LIVE).toBe("true");
      expect(parseConfig(vars)).toMatchObject({ status: "error" });
    }
  });

  it("targets the separate preview Worker and inherits Base secrets without enabling production Version URLs", () => {
    expect(pkg.scripts["deploy:preview"]).toContain("wrangler preview --env preview");
    expect(pkg.scripts["deploy:preview"]).not.toContain("--ignore-base-config");
    expect(config.preview_urls).toBe(false);
  });
});

describe("workerd tests", () => {
  /** One sentence naming the file and the fix when the vitest workerd runtime differs from the Worker's. */
  const runtimeDrift = (vitest: string, worker: { compatibility_date: string; compatibility_flags: string[] }) => {
    const date = /compatibilityDate: "([^"]*)"/.exec(vitest)?.[1];
    const list = /compatibilityFlags: \[([^\]]*)\]/.exec(vitest)?.[1] ?? "";
    const flags = Array.from(list.matchAll(/"([^"]+)"/g), (match) => match[1]);
    return date === worker.compatibility_date && JSON.stringify(flags) === JSON.stringify(worker.compatibility_flags)
      ? []
      : [
          "`vitest.config.mts` runs workerd unlike `wrangler.jsonc`; copy wrangler.jsonc's compatibility date and flags.",
        ];
  };

  it("names the file and the fix when the date or flags drift", () => {
    const worker = { compatibility_date: "2026-01-01", compatibility_flags: ["nodejs_compat"] };
    expect(runtimeDrift('compatibilityDate: "2026-01-01", compatibilityFlags: ["nodejs_compat"]', worker)).toEqual([]);
    expect(runtimeDrift('compatibilityDate: "2025-12-31", compatibilityFlags: ["nodejs_compat"]', worker)).toHaveLength(
      1,
    );
    expect(runtimeDrift('compatibilityDate: "2026-01-01", compatibilityFlags: []', worker)).toHaveLength(1);
  });

  it("run on the deployed Worker's compatibility date and flags", () => {
    expect(runtimeDrift(readFileSync("vitest.config.mts", "utf8"), config)).toEqual([]);
  });
});
