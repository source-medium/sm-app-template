import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { sampleEnvironment } from "../../scripts/lib/sample-env";

function schema(settings: Record<string, string | undefined>) {
  return spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "scripts/schema.ts", "obt_orders"], {
    cwd: new URL("../..", import.meta.url),
    env: { ...process.env, ...sampleEnvironment, ...settings },
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("schema CLI in managed mode", () => {
  it.each([
    [{ SM_HOSTING: "managed-dev" }, "SM_DATA_API_URL"],
    [{ SM_HOSTING: "managed" }, "SM_DEPLOYMENT_ID"],
    [
      {
        SM_HOSTING: "managed-dev",
        SM_DATA_API_URL: "https://urchin.test/api/app-data/v1",
        APP_BASIC_AUTH: "viewer:test-only",
      },
      "APP_BASIC_AUTH",
    ],
  ])("refuses invalid managed settings instead of printing the snapshot: %j", (settings, variable) => {
    const result = schema(settings);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("SourceMedium managed configuration is invalid");
    expect(result.stderr).toContain(variable);
    expect(result.stdout).not.toContain("snapshot of SourceMedium");
    expect(result.stderr).not.toMatch(/Google|BigQuery|app key/i);
  });
  it("keeps the explicitly offline schema available outside managed modes", () => {
    const result = schema({});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("snapshot of SourceMedium's published schema");
  });
});
