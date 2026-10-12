import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

// Execute the real runner with fake OS/package-manager and browser boundaries.
// The same script also runs against real, non-root Ubuntu during release validation.
function runBrowser(
  options: { cloud?: boolean; launch?: string; failure?: string; report?: string; exit?: number } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "sm-browser-runner-"));
  directories.push(directory);
  const log = join(directory, "calls.jsonl");
  const temporary = join(directory, "tmp");
  const bin = join(directory, "bin");
  const playwrightModule = join(directory, "node_modules", "@playwright", "test");
  for (const dir of [temporary, bin, playwrightModule]) mkdirSync(dir, { recursive: true });
  writeFileSync(log, "");
  copyFileSync(resolve("scripts/test-browser.mjs"), join(directory, "test-browser.mjs"));
  writeFileSync(join(directory, "platform.mjs"), 'Object.defineProperty(process, "platform", { value: "linux" });');
  writeFileSync(
    join(playwrightModule, "package.json"),
    JSON.stringify({ type: "module", exports: { ".": "./index.js", "./cli": "./cli.js" } }),
  );
  const record = `
    import { appendFileSync, writeFileSync } from 'node:fs';
    const record = (call) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(call) + '\\n');
  `;
  writeFileSync(
    join(playwrightModule, "index.js"),
    `${record}
    export const chromium = { launch: async (options) => {
      const libraries = options?.env?.LD_LIBRARY_PATH;
      record({ command: 'launch', libraries });
      if (${JSON.stringify(options.launch ?? "missing")} === 'unrelated') throw Error('Executable does not exist');
      if (${JSON.stringify(options.launch ?? "missing")} === 'missing' && !libraries)
        throw Error('error while loading shared libraries: libatk-1.0.so.0');
      if (${JSON.stringify(options.failure)} === 'launch' && libraries) throw Error('Still cannot launch');
      return { close: async () => {} };
    } };
  `,
  );
  writeFileSync(
    join(playwrightModule, "cli.js"),
    `${record}
    const [command, ...args] = process.argv.slice(2);
    record({ command, args, libraries: process.env.LD_LIBRARY_PATH, fonts: process.env.FONTCONFIG_FILE, apt: process.env.APT_CONFIG });
    if (command === 'install-deps') {
      console.log(${JSON.stringify(options.report ?? "Missing system dependencies (2):\n  libatk1.0-0t64\n  libatspi2.0-0t64")});
      process.exit(1);
    }
    process.exit(${options.exit ?? 0});
  `,
  );
  const command = join(directory, "package-command.mjs");
  writeFileSync(
    command,
    `${record}
    const [command, ...args] = process.argv.slice(2);
    record({ command, args, apt: process.env.APT_CONFIG });
    if (${JSON.stringify(options.failure)} === args[0]) { console.error('Synthetic package failure'); process.exit(23); }
    if (args[0] === 'download') for (const name of args.slice(1)) writeFileSync(name + '.deb', 'synthetic');
  `,
  );
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  for (const name of ["apt-get", "dpkg-deb"]) {
    const file = join(bin, name);
    writeFileSync(file, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(command)} ${quote(name)} "$@"\n`);
    chmodSync(file, 0o755);
  }
  const result = spawnSync(
    process.execPath,
    ["--import", join(directory, "platform.mjs"), join(directory, "test-browser.mjs"), "--grep", "specific report"],
    {
      cwd: directory,
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        PATH: bin + delimiter + process.env.PATH,
        TMPDIR: temporary,
        LD_LIBRARY_PATH: "",
        APT_CONFIG: "",
        WORKERS_CI_COMMIT_SHA: options.cloud === false ? "" : "a".repeat(40),
      },
    },
  );
  return {
    ...result,
    temporary,
    calls: readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as { command: string; args?: string[]; libraries?: string; fonts?: string; apt?: string },
      ),
  };
}

describe.skipIf(process.platform === "win32")("browser test runner", () => {
  it("resolves the pinned browser dependencies without installing them, scopes libraries and cleans up", () => {
    const result = runBrowser();
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls.filter((call) => call.command === "apt-get").map((call) => call.args)).toEqual([
      ["update"],
      ["download", "libatk1.0-0t64", "libatspi2.0-0t64"],
    ]);
    expect(result.calls.find((call) => call.command === "install-deps")).toMatchObject({
      args: ["--dry-run", "chromium"],
      apt: expect.stringContaining(result.temporary),
    });
    expect(result.calls.filter((call) => call.command === "dpkg-deb")).toHaveLength(2);
    const test = result.calls.at(-1);
    expect(test).toMatchObject({
      command: "test",
      args: ["--grep", "specific report"],
      libraries: expect.stringContaining(result.temporary),
      fonts: expect.stringContaining(result.temporary),
      apt: "",
    });
    expect(readdirSync(result.temporary)).toEqual([]);
  });

  it("does not download libraries when Chromium already works", () => {
    const result = runBrowser({ launch: "ready" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls.map((call) => call.command)).toEqual(["launch", "test"]);
  });

  it("leaves ordinary local browser behavior intact and preserves test failures", () => {
    const result = runBrowser({ cloud: false, exit: 37 });
    expect(result.status).toBe(37);
    expect(result.calls.map((call) => call.command)).toEqual(["test"]);
  });

  it("does not mistake a missing browser download for a library failure", () => {
    const result = runBrowser({ launch: "unrelated" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Executable does not exist");
    expect(result.calls.map((call) => call.command)).toEqual(["launch"]);
  });

  it.each(["update", "download", "--extract", "launch"])(
    "a failed %s blocks tests and removes temporary files",
    (failure) => {
      const result = runBrowser({ failure });
      expect(result.status).toBe(1);
      expect(result.calls.some((call) => call.command === "test")).toBe(false);
      expect(readdirSync(result.temporary)).toEqual([]);
    },
  );

  it("fails closed if the package-report contract changes", () => {
    const result = runBrowser({ report: "unexpected package output" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not resolve Chromium libraries");
    expect(result.calls.some((call) => call.args?.[0] === "download")).toBe(false);
    expect(readdirSync(result.temporary)).toEqual([]);
  });

  it("cleans up after failing tests and preserves their exit status", () => {
    const result = runBrowser({ exit: 37 });
    expect(result.status).toBe(37);
    expect(readdirSync(result.temporary)).toEqual([]);
  });
});
