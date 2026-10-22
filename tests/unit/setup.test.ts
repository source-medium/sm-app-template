import { describe, expect, it } from "vitest";
import ts from "typescript";
import { credentialInstructions, EMPTY_PLAN, requireProductionLive, SetupPlan } from "../../scripts/lib/setup";
import { parseConfig } from "@/lib/config/env.server";

describe("owner setup", () => {
  it.each([
    '{ "name": "customer-app", "env": {"preview": {"vars": {"APP_REQUIRE_LIVE": "true"}}} }',
    '{ "name": "customer-app", // preserve this comment\n"vars": {"APP_ENVIRONMENT":"production", "APP_REQUIRE_LIVE":"false", "EXISTING": "keep"}, "keep_vars":true }',
  ])("writes live intent without touching unrelated config or previews", (source) => {
    const changed = requireProductionLive(source);
    const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", changed);
    expect(parsed.error).toBeUndefined();
    const expected = ts.parseConfigFileTextToJson("wrangler.jsonc", source).config;
    expect(parsed.config).toEqual({ ...expected, vars: { ...expected.vars, APP_REQUIRE_LIVE: "true" } });
    expect(requireProductionLive(changed)).toBe(changed);
    expect(parseConfig(parsed.config.vars)).toMatchObject({ status: "error" });
    if (source.includes("// preserve")) expect(changed).toContain("// preserve this comment");
  });
  it.each(["https://user:secret@example.com", "https://example.com?token=private", "http://example.com"])(
    "rejects credential-bearing or unprotected targets: %s",
    (url) => {
      expect(SetupPlan.safeParse({ ...EMPTY_PLAN, production: { url, buildURL: null } }).success).toBe(false);
      expect(SetupPlan.safeParse({ ...EMPTY_PLAN, production: { url: null, buildURL: url } }).success).toBe(false);
    },
  );
  it("gives auth-specific private destinations and preserves local Development sign-in", () => {
    const access = credentialInstructions("access", "production", "customer-app").join("\n");
    expect(access).toContain("customer-app → Settings → Variables and Secrets (Production app)");
    expect(access).toContain("Remove APP_BASIC_AUTH");
    expect(access).not.toContain("Enter SM_CONNECTION and APP_BASIC_AUTH");
    expect(credentialInstructions("basic", "preview", "customer-app").join("\n")).toContain(
      "customer-app-preview → Settings → Previews Base (Development app)",
    );
    expect(credentialInstructions("access", "local", "customer-app").join("\n")).toContain(
      "Enter SM_CONNECTION and APP_BASIC_AUTH",
    );
    expect(credentialInstructions(null, "production", "customer-app").join("\n")).toContain("Choose --auth");
  });
});
