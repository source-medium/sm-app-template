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
  function connection(values = liveEnv(key)): string {
    return btoa(
      JSON.stringify({ version: 1, values: Object.fromEntries(LIVE_VARIABLES.map((name) => [name, values[name]])) }),
    );
  }

  it.each(["basic", "access"])("a connection bundle preserves the complete %s configuration", (guard) => {
    const viewer = guard === "basic" ? { APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}` } : ACCESS;
    const settings = {
      ...viewer,
      APP_STORE_ID: "store_1",
      BIGQUERY_MAX_BYTES_BILLED: "5000000",
      APP_REQUIRE_LIVE: "true",
    };
    expect(parseConfig({ SM_CONNECTION: connection(), ...settings })).toEqual(
      parseConfig({ ...liveEnv(key, { APP_BASIC_AUTH: undefined }), ...settings }),
    );
  });

  it("a connection bundle cannot omit, supply, or bypass a viewer guard", () => {
    expect(problemsOf(parseConfig({ SM_CONNECTION: connection() }))).toEqual(["APP_BASIC_AUTH"]);
    expect(
      parseConfig({ SM_CONNECTION: connection(), APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}`, ...ACCESS }).status,
    ).toBe("error");
    for (const injected of [{ APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}` }, { APP_STORE_ID: "another-store" }]) {
      const values = Object.fromEntries(LIVE_VARIABLES.map((name) => [name, liveEnv(key)[name]]));
      expect(
        problemsOf(
          parseConfig({ SM_CONNECTION: btoa(JSON.stringify({ version: 1, values: { ...values, ...injected } })) }),
        ),
      ).toEqual(["SM_CONNECTION"]);
    }
  });

  it.each(LIVE_VARIABLES)("rejects missing bundle field %s without echoing its contents", (name) => {
    const encoded = connection(liveEnv(key, { [name]: undefined }));
    const config = parseConfig({ SM_CONNECTION: encoded });
    expect(problemsOf(config)).toEqual(["SM_CONNECTION"]);
    expect(JSON.stringify(config)).not.toContain(key.base64);
    expect(JSON.stringify(config)).not.toContain(encoded);
  });

  it.each(["not-base64!", btoa("not json"), btoa("null"), btoa('{"version":2,"values":{}}'), "a".repeat(32_769)])(
    "a malformed bundle fails closed",
    (encoded) => {
      expect(problemsOf(parseConfig({ SM_CONNECTION: encoded }))).toEqual(["SM_CONNECTION"]);
    },
  );

  it("applies key and metadata validation to bundles without leaking values", () => {
    for (const values of [
      liveEnv(key, { BIGQUERY_JOB_PROJECT_ID: "sm-other-project" }),
      liveEnv(key, { BIGQUERY_LOCATION: "private-invalid-location" }),
      liveEnv(key, { SM_APP_KEY: "private-invalid-key" }),
    ]) {
      const config = parseConfig({ SM_CONNECTION: connection(values), APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}` });
      expect(problemsOf(config)).toEqual(["SM_CONNECTION"]);
      expect(JSON.stringify(config)).not.toMatch(/private-invalid|BEGIN PRIVATE KEY/);
    }
  });

  it("rejects mixed connection formats instead of choosing stale credentials", () => {
    for (const name of LIVE_VARIABLES) {
      expect(problemsOf(parseConfig({ SM_CONNECTION: connection(), [name]: liveEnv(key)[name] }))).toEqual([
        "SM_CONNECTION",
      ]);
    }
  });

  it("replacing the connection changes the key but preserves viewer access and store scope", async () => {
    const replacement = await makeServiceAccountKey(undefined, "replacement");
    const guard = { APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}`, APP_STORE_ID: "store_1" };
    const before = parseConfig({ SM_CONNECTION: connection(), ...guard });
    const after = parseConfig({ SM_CONNECTION: connection(liveEnv(replacement)), ...guard });
    if (before.status !== "ok" || before.mode !== "live" || after.status !== "ok" || after.mode !== "live")
      throw new Error("expected live");
    expect(after.guard).toEqual(before.guard);
    expect(after.storeId).toBe(before.storeId);
    expect(after.live.key.privateKeyPem).not.toBe(before.live.key.privateKeyPem);
  });

  it("no live values and no guard is a public sample", () => {
    expect(parseConfig({})).toEqual({ status: "ok", mode: "sample", guard: null, storeId: null });
  });

  it("no live values and the Basic guard is a protected sample", () => {
    const config = parseConfig({ APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}` });
    expect(config).toMatchObject({ status: "ok", mode: "sample", guard: { kind: "basic", username: "viewer" } });
  });

  it("no live values and the Access guard is a protected sample", () => {
    const config = parseConfig(ACCESS);
    expect(config).toMatchObject({ status: "ok", mode: "sample", guard: { kind: "access" } });
  });

  it("a live-only deployment cannot silently serve sample data, even with a guard", () => {
    for (const guard of [{}, { APP_BASIC_AUTH: `viewer:${TEST_PASSWORD}` }, ACCESS]) {
      const config = parseConfig({ ...guard, APP_REQUIRE_LIVE: "true" });
      expect(problemsOf(config)).toContain("APP_REQUIRE_LIVE");
    }
  });

  it("live-only uses the same live validation and viewer guard", () => {
    expect(parseConfig(liveEnv(key, { APP_REQUIRE_LIVE: "true" }))).toMatchObject({ status: "ok", mode: "live" });
    expect(problemsOf(parseConfig(liveEnv(key, { APP_REQUIRE_LIVE: "true", APP_BASIC_AUTH: undefined })))).toContain(
      "APP_BASIC_AUTH",
    );
    const partial = parseConfig(liveEnv(key, { APP_REQUIRE_LIVE: "true", SM_APP_KEY: undefined }));
    expect(problemsOf(partial)).toContain("SM_APP_KEY");
    expect(JSON.stringify(partial)).not.toContain("remove every live value");
  });

  it.each(["yes", "1", "TRUE", "private-mode-canary"])(
    "rejects a malformed live-only setting without echoing it",
    (value) => {
      for (const env of [{}, liveEnv(key)]) {
        const config = parseConfig({ ...env, APP_REQUIRE_LIVE: value });
        expect(problemsOf(config)).toContain("APP_REQUIRE_LIVE");
        expect(JSON.stringify(config)).not.toContain(value);
      }
    },
  );

  it.each([undefined, "", "false"])("preserves first-run sample mode when live-only is %s", (value) => {
    expect(parseConfig({ APP_REQUIRE_LIVE: value })).toMatchObject({ status: "ok", mode: "sample" });
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
    expect(parseConfig({ APP_BASIC_AUTH: " \t " })).toEqual({
      status: "ok",
      mode: "sample",
      guard: null,
      storeId: null,
    });
  });

  it("supports one exact store in sample and live modes; an empty setting preserves all-store access", () => {
    const storeId = "store #1 & 50% / Montréal";
    expect(parseConfig({ APP_STORE_ID: storeId })).toMatchObject({ status: "ok", mode: "sample", storeId });
    expect(parseConfig(liveEnv(key, { APP_STORE_ID: storeId }))).toMatchObject({ status: "ok", mode: "live", storeId });
    expect(parseConfig({ APP_STORE_ID: "" })).toMatchObject({ status: "ok", storeId: null });
  });

  it.each([
    " ",
    " private-scope-canary",
    "private-scope-canary ",
    "private\nstore",
    "private\u0000store",
    "x".repeat(201),
  ])("fails closed on malformed store scope without echoing it", (storeId) => {
    for (const env of [{ APP_STORE_ID: storeId }, liveEnv(key, { APP_STORE_ID: storeId })]) {
      const config = parseConfig(env);
      expect(problemsOf(config)).toContain("APP_STORE_ID");
      if (config.status !== "error") throw new Error("Expected configuration error");
      if (storeId.trim().length > 1)
        expect(config.problems.map((problem) => problem.message).join(" ")).not.toContain(storeId);
    }
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

describe("managed development", () => {
  const TOKEN = `smapp_${"b".repeat(43)}`;
  const MANAGED = {
    SM_HOSTING: "managed-dev",
    SM_DATA_API_URL: "https://urchin.sourcemedium.com/api/app-data/v1",
    SM_DEVELOPER_TOKEN: TOKEN,
  };

  it("reads the data API address and token, with no guard or store restriction", () => {
    expect(parseConfig(MANAGED)).toEqual({
      status: "ok",
      mode: "managed-dev",
      guard: null,
      storeId: null,
      managed: { dataApiUrl: "https://urchin.sourcemedium.com/api/app-data/v1", developerToken: TOKEN },
    });
  });

  it("runs without a token when the environment's proxy adds it, and keeps a placeholder a proxy swaps", () => {
    const withoutToken = parseConfig({ ...MANAGED, SM_DEVELOPER_TOKEN: undefined });
    expect(withoutToken.status === "ok" && withoutToken.mode === "managed-dev" && withoutToken.managed).toEqual({
      dataApiUrl: MANAGED.SM_DATA_API_URL,
      developerToken: null,
    });
    const placeholder = parseConfig({ ...MANAGED, SM_DEVELOPER_TOKEN: "codex-secret-placeholder" });
    expect(placeholder.status).toBe("ok");
  });

  it("accepts http only for a SourceMedium running on this computer, and normalizes a trailing slash", () => {
    const local = parseConfig({ ...MANAGED, SM_DATA_API_URL: "http://localhost:3000/api/app-data/v1/" });
    expect(local.status === "ok" && local.mode === "managed-dev" && local.managed.dataApiUrl).toBe(
      "http://localhost:3000/api/app-data/v1",
    );
  });

  it.each([
    ["no address", { SM_DATA_API_URL: undefined }, "SM_DATA_API_URL"],
    ["http to another host", { SM_DATA_API_URL: "http://urchin.example.com/api/app-data/v1" }, "SM_DATA_API_URL"],
    ["another path", { SM_DATA_API_URL: "https://urchin.example.com/api/internal" }, "SM_DATA_API_URL"],
    ["a query string", { SM_DATA_API_URL: `${MANAGED.SM_DATA_API_URL}?app=other` }, "SM_DATA_API_URL"],
    ["embedded credentials", { SM_DATA_API_URL: "https://u:p@urchin.example.com/api/app-data/v1" }, "SM_DATA_API_URL"],
    ["a truncated token", { SM_DEVELOPER_TOKEN: TOKEN.slice(0, 20) }, "SM_DEVELOPER_TOKEN"],
    ["a token with spaces", { SM_DEVELOPER_TOKEN: "not a token" }, "SM_DEVELOPER_TOKEN"],
    ["hosted mode set by hand", { SM_HOSTING: "managed" }, "SM_HOSTING"],
    ["an unknown hosting mode", { SM_HOSTING: "vercel" }, "SM_HOSTING"],
  ])("%s is an error", (_label, override, variable) => {
    expect(problemsOf(parseConfig({ ...MANAGED, ...override }))).toContain(variable);
  });

  it("refuses every self-hosted setting rather than mixing modes or falling back to sample data", () => {
    const selfHosted = {
      ...liveEnv(key),
      SM_CONNECTION: "eyJ2ZXJzaW9uIjoxfQ==",
      ...ACCESS,
      APP_STORE_ID: "store_1",
      BIGQUERY_MAX_BYTES_BILLED: "5000000",
    };
    for (const [name, value] of Object.entries(selfHosted)) {
      if (value === undefined) continue;
      expect(problemsOf(parseConfig({ ...MANAGED, [name]: value })), name).toEqual([name]);
    }
  });

  it("refuses managed settings without SM_HOSTING, so a self-hosted app never half-switches", () => {
    expect(problemsOf(parseConfig({ SM_DATA_API_URL: MANAGED.SM_DATA_API_URL }))).toEqual(["SM_DATA_API_URL"]);
    expect(problemsOf(parseConfig({ ...liveEnv(key), SM_DEVELOPER_TOKEN: TOKEN }))).toEqual(["SM_DEVELOPER_TOKEN"]);
  });

  it("never echoes the token or address in a problem", () => {
    const config = parseConfig({ ...MANAGED, SM_DEVELOPER_TOKEN: `${TOKEN}x`, APP_STORE_ID: "store_1" });
    expect(config.status).toBe("error");
    expect(JSON.stringify(config)).not.toContain(TOKEN);
  });
});
