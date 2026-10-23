import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";
import {
  credentialInstructions,
  EMPTY_PLAN,
  requireProductionLive,
  SetupPlan,
  sourcePushStatus,
} from "../../scripts/lib/setup";
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

describe("source push status", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();

  /** The Artifacts layout (docs/cloud.md): origin is the template, cloudflare is the customer's repository. */
  function artifactsCheckout() {
    const dir = mkdtempSync(join(tmpdir(), "setup-push-"));
    dirs.push(dir);
    for (const bare of ["template.git", "customer.git"]) git(dir, "init", "-q", "--bare", "-b", "main", bare);
    const work = join(dir, "work");
    git(dir, "init", "-q", "-b", "main", work);
    git(work, "commit", "-q", "--allow-empty", "-m", "template");
    git(work, "remote", "add", "origin", join(dir, "template.git"));
    git(work, "push", "-q", "origin", "main");
    git(work, "remote", "add", "cloudflare", join(dir, "customer.git"));
    return { work, status: () => sourcePushStatus((args) => git(work, ...args)) };
  }

  it("reads the branch's upstream remote, not origin", () => {
    const { work, status } = artifactsCheckout();
    // The template's origin has HEAD; the customer's tracked branch does not exist yet.
    git(work, "config", "branch.main.remote", "cloudflare");
    git(work, "config", "branch.main.merge", "refs/heads/main");
    expect(git(work, "ls-remote", "origin", "refs/heads/main").split(/\s/)[0]).toBe(git(work, "rev-parse", "HEAD"));
    expect(status().line).toMatch(/^Source: [0-9a-f]{12} not confirmed on cloudflare\/main\.$/);
    git(work, "push", "-q", "cloudflare", "main");
    expect(status()).toEqual({
      head: git(work, "rev-parse", "HEAD"),
      line: expect.stringMatching(/ pushed to cloudflare\/main\.$/),
    });
  });

  it("is unknown, never unpushed, without an upstream or a branch", () => {
    const { work, status } = artifactsCheckout();
    expect(status().line).toContain("tracks no remote branch, so push status is unknown");
    git(work, "checkout", "-q", "--detach");
    expect(status().line).toContain("detached HEAD, so push status is unknown");
  });

  it("is unavailable outside a repository", () => {
    expect(
      sourcePushStatus(() => {
        throw new Error("not a git repository");
      }),
    ).toEqual({ head: null, line: "Source: remote push status unavailable." });
  });
});
