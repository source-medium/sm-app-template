import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

// Execute the real bootstrap in an isolated project. Only npm (network/install)
// and Playwright's browser launch are replaced with test boundaries.
function fixture({
  browser = true,
  installExit = 0,
  browserInstallExit = 0,
  repairBrowser = true,
  minimum = ">=22.13.0",
} = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "agent-setup-")));
  directories.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  mkdirSync(join(dir, "scripts"));
  copyFileSync("scripts/setup-agent.mjs", join(dir, "scripts/setup-agent.mjs"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ packageManager: "pnpm@10.34.5", engines: { node: minimum } }),
  );
  const browserPath = join(dir, "chromium");
  if (browser) writeFileSync(browserPath, "test browser");
  const moduleDir = join(dir, "node_modules/@playwright/test");
  mkdirSync(moduleDir, { recursive: true });
  writeFileSync(
    join(moduleDir, "index.js"),
    `exports.chromium = { launch: async () => { if (!require('node:fs').existsSync(${JSON.stringify(browserPath)})) throw new Error('Browser unavailable'); return { close: async () => {} }; } };`,
  );
  const log = join(dir, "calls.jsonl");
  const stub = join(bin, "npm-stub.cjs");
  writeFileSync(
    stub,
    `const fs = require('node:fs'); fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + String.fromCharCode(10)); const browserInstall = process.argv.includes('playwright'); if (browserInstall && ${repairBrowser}) fs.writeFileSync(${JSON.stringify(browserPath)}, 'installed browser'); process.exit(browserInstall ? ${browserInstallExit} : ${installExit});`,
  );
  const shim = join(bin, process.platform === "win32" ? "npm.cmd" : "npm");
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(
    shim,
    process.platform === "win32"
      ? `@echo off\r\n"${process.execPath}" "${stub}" %*\r\n`
      : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(stub)} "$@"\n`,
  );
  chmodSync(shim, 0o755);
  return {
    dir,
    run: (remote: boolean, hook = true) =>
      spawnSync(process.execPath, [join(dir, "scripts/setup-agent.mjs"), ...(hook ? ["--claude-hook"] : [])], {
        cwd: tmpdir(),
        encoding: "utf8",
        env: { ...process.env, PATH: bin + delimiter + process.env.PATH, CLAUDE_CODE_REMOTE: String(remote) },
      }),
    calls: () =>
      existsSync(log)
        ? readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as { args: string[]; cwd: string })
        : [],
  };
}

describe("cloud agent bootstrap", () => {
  it("leaves local Claude sessions untouched", () => {
    const project = fixture();
    expect(project.run(false).status).toBe(0);
    expect(project.calls()).toEqual([]);
  });

  it("runs the pinned frozen install from another working directory and reuses Chromium", () => {
    const project = fixture();
    const result = project.run(true);
    expect(result.status, result.stderr).toBe(0);
    expect(project.calls()).toEqual([
      {
        args: ["exec", "--yes", "--package=pnpm@10.34.5", "--", "pnpm", "install", "--frozen-lockfile"],
        cwd: project.dir,
      },
    ]);
  });

  it("installs a missing browser for an explicit setup outside Claude", () => {
    const project = fixture({ browser: false });
    const result = project.run(false, false);
    expect(result.status, result.stderr).toBe(0);
    expect(project.calls()[1]?.args).toEqual([
      "exec",
      "--yes",
      "--package=pnpm@10.34.5",
      "--",
      "pnpm",
      "exec",
      "playwright",
      "install",
      ...(process.platform === "linux" ? ["--with-deps"] : []),
      "chromium",
    ]);
  });

  it("stops on a failed install instead of reporting setup ready", () => {
    const project = fixture({ browser: false, installExit: 37 });
    const result = project.run(true);
    expect(result.status).toBe(37);
    expect(project.calls()).toHaveLength(1);
    expect(result.stdout).not.toContain("Agent setup ready");
    expect(result.stderr).toContain("Agent setup failed");
  });

  it("rejects an unsupported runtime before installing", () => {
    const project = fixture({ minimum: ">=99.0.0" });
    const result = project.run(true);
    expect(result.status).toBe(1);
    expect(project.calls()).toEqual([]);
    expect(result.stderr).toContain("Use Node >=99.0.0");
  });

  it("stops when the browser download or OS dependency installation fails", () => {
    const project = fixture({ browser: false, browserInstallExit: 23 });
    const result = project.run(true);
    expect(result.status).toBe(23);
    expect(project.calls()).toHaveLength(2);
    expect(result.stdout).not.toContain("Agent setup ready");
    expect(result.stderr).toContain("Agent setup failed");
  });

  it("does not report readiness when a successful install still cannot launch the browser", () => {
    const project = fixture({ browser: false, repairBrowser: false });
    const result = project.run(true);
    expect(result.status).toBe(1);
    expect(project.calls()).toHaveLength(2);
    expect(result.stdout).not.toContain("Agent setup ready");
    expect(result.stderr).toContain("Browser unavailable");
  });
});
