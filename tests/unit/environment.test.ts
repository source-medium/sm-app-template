import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configuredSecretValues, parseDotenv, readDevVars } from "../../scripts/lib/environment";

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

describe("Worker preview runtime values", () => {
  it("parses dotenv lines with export prefixes, quotes, blanks and comments", () => {
    expect(parseDotenv('# note\nexport A=1\nB="two words"\nC=\n\nnot a line\n D = spaced \n')).toEqual({
      A: "1",
      B: "two words",
      C: "",
      D: "spaced",
    });
  });

  it("reads .dev.vars alone and reports its absence", () => {
    expect(readDevVars(directory)).toBeNull();
    writeFileSync(join(directory, ".env.local"), "APP_BASIC_AUTH=viewer:local-synthetic-password-0123456789\n");
    expect(readDevVars(directory)).toBeNull();
    writeFileSync(join(directory, ".dev.vars"), "APP_STORE_ID=store_1\n");
    expect(readDevVars(directory)).toEqual({ APP_STORE_ID: "store_1" });
  });
});

describe("scripts under react-server conditions", () => {
  it("load the modules pnpm dev and pnpm diagnose import", () => {
    // app.config.ts's navigation icons cannot load under these conditions, so shared data modules must not import it.
    const modules = [
      "./src/lib/config/env.server.ts",
      "./src/lib/data/warehouse.server.ts",
      "./src/lib/data/connection-report.ts",
      "./scripts/lib/environment.ts",
    ];
    const code = `Promise.all(${JSON.stringify(modules)}.map((path) => import(path))).then(() => console.log("loaded"))`;
    const tsx = createRequire(import.meta.url).resolve("tsx/cli");
    const result = spawnSync(process.execPath, [tsx, "--conditions=react-server", "-e", code], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe("loaded");
  });
});
