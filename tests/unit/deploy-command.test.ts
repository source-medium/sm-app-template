import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import pkg from "../../package.json";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const checks = ["check", "test:secrets", "test:browser", "build:cloudflare", "smoke:worker"];

// Execute the actual package scripts. Replace only subprocess boundaries so
// failures cannot contact Cloudflare and do not run five real builds per test.
function deploy(script: "deploy" | "deploy:preview", failure = "", args = "") {
  const dir = mkdtempSync(join(tmpdir(), "sm-deploy-command-"));
  directories.push(dir);
  const log = join(dir, "calls.jsonl");
  writeFileSync(log, "");
  const stub = join(dir, "command.cjs");
  writeFileSync(
    stub,
    `
    const { appendFileSync } = require('node:fs');
    const { spawnSync } = require('node:child_process');
    const [command, ...args] = process.argv.slice(2);
    if (command === 'pnpm' && args[0] === 'check:deploy') {
      const result = spawnSync(${JSON.stringify(pkg.scripts["check:deploy"])}, { shell: true, stdio: 'inherit' });
      process.exit(result.status ?? 1);
    }
    appendFileSync(${JSON.stringify(log)}, JSON.stringify([command, ...args]) + String.fromCharCode(10));
    process.exit(command === 'pnpm' && args.join(' ') === ${JSON.stringify(failure)} ? 37 : 0);
  `,
  );
  for (const command of ["pnpm", "opennextjs-cloudflare", "wrangler"]) {
    const shim = join(dir, command + (process.platform === "win32" ? ".cmd" : ""));
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    writeFileSync(
      shim,
      process.platform === "win32"
        ? `@echo off\r\n"${process.execPath}" "${stub}" ${command} %*\r\n`
        : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(stub)} ${command} "$@"\n`,
    );
    chmodSync(shim, 0o755);
  }
  const result = spawnSync(pkg.scripts[script] + args, {
    cwd: dir,
    shell: true,
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, PATH: dir + delimiter + process.env.PATH },
  });
  return {
    ...result,
    calls: readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]),
  };
}

describe("deployment release gate", () => {
  it.each(checks)("a failed %s blocks publication and all later steps", (failure) => {
    const result = deploy("deploy", failure);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(37);
    expect(result.calls).toEqual(
      checks.slice(0, checks.indexOf(failure) + 1).map((step) => ["pnpm", ...step.split(" ")]),
    );
  });

  it("publishes the checked artifact and forwards the persistent environment after all checks", () => {
    const result = deploy("deploy", "", " --env preview");
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([
      ...checks.map((step) => ["pnpm", ...step.split(" ")]),
      ["opennextjs-cloudflare", "deploy", "--env", "preview"],
    ]);
  });

  it("uses the same gate for branch previews", () => {
    const failed = deploy("deploy:preview", "test:browser");
    expect(failed.status, failed.stderr).toBe(37);
    expect(failed.calls).toEqual([
      ["pnpm", "check"],
      ["pnpm", "test:secrets"],
      ["pnpm", "test:browser"],
    ]);
    const passed = deploy("deploy:preview");
    expect(passed.status, passed.stderr).toBe(0);
    expect(passed.calls).toEqual([
      ...checks.map((step) => ["pnpm", ...step.split(" ")]),
      ["wrangler", "preview", "--env", "preview"],
    ]);
  });
});
