import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configuredSecretValues } from "../../scripts/lib/environment";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "sm-env-scan-"));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("build scan credential sources", () => {
  it("scans injected credentials even without a local env file", () => {
    const key = "synthetic-environment-key-".repeat(12);
    const password = "synthetic-password-0123456789";
    const values = configuredSecretValues(directory, {
      SM_APP_KEY: key,
      APP_BASIC_AUTH: `viewer:${password}`,
      PATH: "not-a-secret-to-scan",
    });
    expect(values).toEqual([key, key.slice(40, 120), `viewer:${password}`, password]);
  });

  it("keeps overridden local secrets in the scan and ignores the public example", () => {
    const local = "local-synthetic-password-0123456789";
    const injected = "cloud-synthetic-password-0123456789";
    writeFileSync(join(directory, ".env.local"), `APP_BASIC_AUTH=viewer:${local}\n`);
    writeFileSync(join(directory, ".env.example"), "APP_BASIC_AUTH=viewer:example-password-0123456789\n");
    expect(configuredSecretValues(directory, { APP_BASIC_AUTH: `viewer:${injected}` })).toEqual([
      `viewer:${injected}`,
      injected,
      `viewer:${local}`,
      local,
    ]);
  });

  it("ignores absent and short fragments that would match ordinary bundle text", () => {
    expect(configuredSecretValues(directory, {})).toEqual([]);
    expect(configuredSecretValues(directory, { SM_APP_KEY: "short", APP_BASIC_AUTH: "u:p" })).toEqual([]);
  });
});
