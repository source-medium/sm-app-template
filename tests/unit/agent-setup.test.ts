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
  minimum = ">=22.22.1",
  runtimeInstallExit = 0,
  libraries = true,
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
  const librariesPath = join(dir, "browser-libraries");
  if (libraries) writeFileSync(librariesPath, "test libraries");
  const moduleDir = join(dir, "node_modules/@playwright/test");
  mkdirSync(moduleDir, { recursive: true });
  writeFileSync(
    join(moduleDir, "index.js"),
    `exports.chromium = { launch: async () => { if (![${JSON.stringify(browserPath)}, ${JSON.stringify(librariesPath)}].every(path => require('node:fs').existsSync(path))) throw new Error('Browser unavailable'); return { close: async () => {} }; } };`,
  );
  const log = join(dir, "calls.jsonl");
  const stub = join(bin, "npm-stub.cjs");
  writeFileSync(
    stub,
    `const fs = require('node:fs'); fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + String.fromCharCode(10));
    if (process.argv.includes('--package=node@24')) {
      if (${runtimeInstallExit}) process.exit(${runtimeInstallExit});
      // Simulate downloading a supported Node by lowering only this fixture's
      // artificial minimum before launching the real bootstrap again.
      const pkgPath = ${JSON.stringify(join(dir, "package.json"))};
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); pkg.engines.node = '>=22.22.1'; fs.writeFileSync(pkgPath, JSON.stringify(pkg));
      const result = require('node:child_process').spawnSync(process.execPath, process.argv.slice(process.argv.indexOf('--') + 2), { stdio: 'inherit', env: process.env });
      process.exit(result.status ?? 1);
    }
    const browserInstall = process.argv.includes('playwright'); if (browserInstall && ${repairBrowser}) {
      if (process.argv.includes('install-deps')) fs.writeFileSync(${JSON.stringify(librariesPath)}, 'installed libraries');
      else fs.writeFileSync(${JSON.stringify(browserPath)}, 'installed browser');
    } process.exit(browserInstall ? ${browserInstallExit} : ${installExit});`,
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
        env: {
          ...process.env,
          PATH: bin + delimiter + process.env.PATH,
          CLAUDE_CODE_REMOTE: String(remote),
          CLAUDE_ENV_FILE: join(dir, "hook-environment"),
        },
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
      "chromium",
    ]);
  });

  it.skipIf(process.platform !== "linux")(
    "installs OS libraries only after the downloaded browser cannot launch",
    () => {
      const project = fixture({ browser: false, libraries: false });
      const result = project.run(true);
      expect(result.status, result.stderr).toBe(0);
      expect(project.calls().map((call) => call.args.slice(-2))).toEqual([
        ["install", "--frozen-lockfile"],
        ["install", "chromium"],
        ["install-deps", "chromium"],
      ]);
    },
  );

  it("stops on a failed install instead of reporting setup ready", () => {
    const project = fixture({ browser: false, installExit: 37 });
    const result = project.run(true);
    expect(result.status).toBe(37);
    expect(project.calls()).toHaveLength(1);
    expect(result.stdout).not.toContain("Agent setup ready");
    expect(result.stderr).toContain("Agent setup failed");
  });

  it("rejects an unsupported local runtime before installing", () => {
    const project = fixture({ minimum: ">=99.0.0" });
    const result = project.run(false, false);
    expect(result.status).toBe(1);
    expect(project.calls()).toEqual([]);
    expect(result.stderr).toContain("Use Node >=99.0.0");
  });

  it("repairs an old cloud runtime without a global install and persists it for subsequent commands", () => {
    const project = fixture({ minimum: ">=99.0.0" });
    const result = project.run(true);
    expect(result.status, result.stderr).toBe(0);
    expect(project.calls().map((call) => call.args[2])).toEqual(["--package=node@24", "--package=pnpm@10.34.5"]);
    expect(readFileSync(join(project.dir, "hook-environment"), "utf8")).toContain("export PATH=");
    expect(result.stdout).toContain("Agent setup ready");
  });

  it("fails clearly when the cloud runtime download is blocked", () => {
    const project = fixture({ minimum: ">=99.0.0", runtimeInstallExit: 19 });
    const result = project.run(true);
    expect(result.status).toBe(19);
    expect(project.calls()).toHaveLength(1);
    expect(result.stderr).toContain("Cloud setup with Node 24 did not finish");
    expect(result.stdout).not.toContain("Agent setup ready");
  });

  // pnpm check and pnpm dev need no browser; a blocked download must not block the session.
  it("finishes with a warning when the browser download fails", () => {
    const project = fixture({ browser: false, browserInstallExit: 23 });
    const result = project.run(true);
    expect(result.status).toBe(0);
    expect(project.calls()).toHaveLength(2);
    expect(result.stderr).toContain("without a test browser (Browser unavailable)");
    expect(result.stderr).not.toContain("Agent setup failed");
  });

  it("finishes with a warning when an installed browser still cannot launch", () => {
    const project = fixture({ browser: false, repairBrowser: false });
    const result = project.run(true);
    expect(result.status).toBe(0);
    expect(project.calls()).toHaveLength(process.platform === "linux" ? 3 : 2);
    expect(result.stderr).toContain("without a test browser (Browser unavailable)");
  });
});
