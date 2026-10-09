import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseConfig } from "@/lib/config/env.server";
import pkg from "../../package.json";

const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", readFileSync("wrangler.jsonc", "utf8"));
if (parsed.error) throw new Error("Invalid Wrangler JSONC");
const config = parsed.config as {
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
