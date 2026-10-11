import * as childProcess from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { nextCli, startServer, stopServer, wranglerCli } from "../../scripts/lib/test-server";

vi.mock("node:child_process", { spy: true });

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
function fixture(source: string) {
  // Spaces and shell metacharacters must remain literal on every platform.
  const dir = mkdtempSync(join(tmpdir(), "sm test & server "));
  directories.push(dir);
  const script = join(dir, "server.cjs");
  writeFileSync(script, source);
  return { script, dir };
}
async function listener() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

it("launches both installed CLIs directly with Node", () => {
  for (const script of [nextCli, wranglerCli]) {
    const result = childProcess.spawnSync(process.execPath, [script, "--version"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  }
});

it("starts and stops a real server and its child process, leaving the port reusable", async () => {
  const port = await listener();
  await port.close();
  const workerCode =
    "require('node:http').createServer((req, res) => res.end('ready')).listen(Number(process.argv[1]), '127.0.0.1');";
  const { script, dir } = fixture(`
    const { spawn } = require('node:child_process');
    const worker = spawn(process.execPath, ['-e', ${JSON.stringify(workerCode)}, process.argv[2]], { stdio: 'ignore' });
    worker.on('exit', () => process.exit());
    setInterval(() => {}, 1000);
  `);
  const options = { cwd: dir, healthUrl: `http://127.0.0.1:${port.port}/healthz`, timeoutMs: 5000 };
  const server = await startServer(script, [String(port.port)], options);
  try {
    expect(await fetch(options.healthUrl).then((r) => r.text())).toBe("ready");
  } finally {
    await server.stop();
  }
  await expect(fetch(options.healthUrl)).rejects.toThrow();
  const second = await startServer(script, [String(port.port)], options);
  await second.stop();
});

it("refuses an occupied port without starting or stopping its existing listener", async () => {
  const port = await listener();
  try {
    await expect(
      startServer("missing.cjs", [], { cwd: tmpdir(), healthUrl: `http://127.0.0.1:${port.port}/healthz` }),
    ).rejects.toThrow("unavailable");
  } finally {
    await port.close();
  }
});

it("fails promptly when the child exits instead of waiting through the startup timeout", async () => {
  const port = await listener();
  await port.close();
  const { script, dir } = fixture("process.exit(37)");
  await expect(
    startServer(script, [], { cwd: dir, healthUrl: `http://127.0.0.1:${port.port}/healthz`, timeoutMs: 5000 }),
  ).rejects.toThrow("(37)");
});

it("handles spawn errors without an unhandled error event", async () => {
  const port = await listener();
  await port.close();
  await expect(
    startServer("missing.cjs", [], {
      cwd: join(tmpdir(), "nonexistent-sm-test-directory"),
      healthUrl: `http://127.0.0.1:${port.port}/healthz`,
    }),
  ).rejects.toThrow("ENOENT");
});

it("cleans up a server that never becomes healthy", async () => {
  const port = await listener();
  await port.close();
  const { script, dir } = fixture("setInterval(() => {}, 1000)");
  await expect(
    startServer(script, [], { cwd: dir, healthUrl: `http://127.0.0.1:${port.port}/healthz`, timeoutMs: 300 }),
  ).rejects.toThrow("startup timeout");
});

it("uses Windows tree termination and reports a failed cleanup", async () => {
  const state = { pid: 12345, exitCode: null as number | null, signalCode: null };
  const child = state as childProcess.ChildProcess;
  const kill = vi.mocked(childProcess.spawnSync);
  kill.mockImplementation(() => {
    state.exitCode = 0;
    return { pid: 1, status: 0, signal: null, output: [], stdout: "", stderr: "" };
  });
  await stopServer(child, "win32");
  expect(kill).toHaveBeenCalledWith(
    "taskkill",
    ["/pid", "12345", "/T", "/F"],
    expect.objectContaining({ windowsHide: true }),
  );
  state.exitCode = null;
  kill.mockReturnValue({ pid: 1, status: 1, signal: null, output: [], stdout: "", stderr: "" });
  await expect(stopServer(child, "win32")).rejects.toThrow("Could not stop");
});
