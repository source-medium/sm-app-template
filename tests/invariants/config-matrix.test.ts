/**
 * Every configuration row behaves as documented in docs/connect.md, in
 * Node and in workerd. Complete live data never runs without a guard, even
 * on localhost, and nothing in a problem message ever echoes a value.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { LIVE_VARIABLES, parseConfig, type AppConfig } from "@/lib/config/env.server";
import { liveEnv, makeServiceAccountKey, TEST_PASSWORD, type TestKey } from "../helpers/service-account";

const ACCESS = { CF_ACCESS_TEAM_DOMAIN: "acme.cloudflareaccess.com", CF_ACCESS_AUD: "a".repeat(64) };
let key: TestKey;

beforeAll(async () => {
  key = await makeServiceAccountKey();
});

function problemsOf(config: AppConfig): string[] {
  return config.status === "error" ? config.problems.map((problem) => problem.variable) : [];
}

describe("configuration matrix", () => {
  it("no live values and no guard is a public sample", () => {
    expect(parseConfig({})).toEqual({ status: "ok", mode: "sample", guard: null });
  });

  it("no live values and the Basic guard is a protected sample", () => {
    const config = parseConfig({ APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}` });
    expect(config).toMatchObject({ status: "ok", mode: "sample", guard: { kind: "basic", username: "viewer" } });
  });

  it("no live values and the Access guard is a protected sample", () => {
    const config = parseConfig(ACCESS);
    expect(config).toMatchObject({ status: "ok", mode: "sample", guard: { kind: "access" } });
  });

  it("a complete live set with Basic is live and protected", () => {
    const config = parseConfig(liveEnv(key));
    expect(config.status).toBe("ok");
    if (config.status !== "ok" || config.mode !== "live") throw new Error("expected live");
    expect(config.guard.kind).toBe("basic");
    expect(config.live.maxBytesBilled).toBe(1024n ** 3n);
    expect(config.live.key.clientEmail).toMatch(/@sm-customer-apps-test\.iam\.gserviceaccount\.com$/);
  });

  it("a complete live set with Access is live and protected", () => {
    const config = parseConfig(liveEnv(key, { APP_BASIC_AUTH: undefined, ...ACCESS }));
    expect(config).toMatchObject({ status: "ok", mode: "live", guard: { kind: "access" } });
  });

  it("a complete live set with no guard is an error, including on localhost", () => {
    for (const extra of [{}, { NODE_ENV: "development", HOST: "localhost" }, { NODE_ENV: "test" }]) {
      const config = parseConfig({ ...liveEnv(key, { APP_BASIC_AUTH: undefined }), ...extra });
      expect(problemsOf(config)).toEqual(["APP_BASIC_AUTH"]);
    }
  });

  it.each(LIVE_VARIABLES)("an incomplete live set (missing %s) is an error, with or without a guard", (missing) => {
    expect(problemsOf(parseConfig(liveEnv(key, { [missing]: undefined })))).toEqual([missing]);
    expect(problemsOf(parseConfig(liveEnv(key, { [missing]: undefined, APP_BASIC_AUTH: undefined })))).toContain(
      missing,
    );
  });

  it("whitespace-only counts as missing", () => {
    expect(problemsOf(parseConfig(liveEnv(key, { SM_DATA_PROJECT_ID: "   " })))).toEqual(["SM_DATA_PROJECT_ID"]);
    expect(parseConfig({ APP_BASIC_AUTH: " \t " })).toEqual({ status: "ok", mode: "sample", guard: null });
  });

  it("dropping only the deployed key fails closed instead of falling back to sample", () => {
    expect(parseConfig(liveEnv(key, { SM_APP_KEY: undefined })).status).toBe("error");
  });

  it.each([
    ["SM_APPLICATION_ID", "not-a-uuid"],
    ["BIGQUERY_JOB_PROJECT_ID", "Bad_Project"],
    ["BIGQUERY_LOCATION", "the moon"],
    ["SM_TRANSFORMED_DATASET_ID", "has-dashes"],
    ["SM_METADATA_DATASET_ID", "has spaces"],
    ["SM_APP_KEY", "%%%not-base64%%%"],
    ["SM_APP_KEY", btoa("{not json")],
    ["SM_APP_KEY", btoa(JSON.stringify({ type: "authorized_user" }))],
  ])("a malformed %s is an error", (variable, value) => {
    expect(problemsOf(parseConfig(liveEnv(key, { [variable]: value })))).toContain(variable);
  });

  it("a key from another project than the job project is an error", async () => {
    const other = await makeServiceAccountKey("sm-other-project");
    expect(problemsOf(parseConfig(liveEnv(other)))).toEqual(["SM_APP_KEY"]);
  });

  it.each([
    ["a partial Access pair (domain only)", { CF_ACCESS_TEAM_DOMAIN: ACCESS.CF_ACCESS_TEAM_DOMAIN }],
    ["a partial Access pair (audience only)", { CF_ACCESS_AUD: ACCESS.CF_ACCESS_AUD }],
    ["an Access domain with a scheme", { ...ACCESS, CF_ACCESS_TEAM_DOMAIN: "https://acme.cloudflareaccess.com" }],
    ["a malformed Basic value", { APP_BASIC_AUTH: "viewer-without-password" }],
    ["a short Basic password", { APP_BASIC_AUTH: "viewer:short" }],
    ["both guards", { APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}`, ...ACCESS }],
  ])("%s is an error in sample and live configurations", (_label, guard) => {
    expect(parseConfig(guard).status).toBe("error");
    expect(parseConfig({ ...liveEnv(key, { APP_BASIC_AUTH: undefined }), ...guard }).status).toBe("error");
  });

  it("a malformed byte ceiling is an error; a valid one overrides the 1 GiB default", () => {
    expect(problemsOf(parseConfig(liveEnv(key, { BIGQUERY_MAX_BYTES_BILLED: "1e9" })))).toEqual([
      "BIGQUERY_MAX_BYTES_BILLED",
    ]);
    const config = parseConfig(liveEnv(key, { BIGQUERY_MAX_BYTES_BILLED: "5000000" }));
    expect(config.status === "ok" && config.mode === "live" && config.live.maxBytesBilled).toBe(5_000_000n);
  });

  it("problem messages never contain a configured value", () => {
    const secrets = [key.base64, TEST_PASSWORD, "acme.cloudflareaccess.com", "a".repeat(64)];
    const configs = [
      parseConfig(liveEnv(key, { APP_BASIC_AUTH: undefined })),
      parseConfig(liveEnv(key, { SM_APPLICATION_ID: "nope" })),
      parseConfig({ ...liveEnv(key), ...ACCESS }),
      parseConfig({ APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}`, CF_ACCESS_AUD: "short" }),
    ];
    for (const config of configs) {
      const text = JSON.stringify(config.status === "error" ? config.problems : config);
      if (config.status !== "error") continue;
      for (const secret of secrets) expect(text).not.toContain(secret);
    }
  });
});
