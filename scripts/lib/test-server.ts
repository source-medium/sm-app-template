import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
// Launch JavaScript directly: pnpm/.bin shims are not executable on Windows.
export const nextCli = require.resolve("next/dist/bin/next");

/** Kill descendants too, including Wrangler's workerd process. */
export async function stopServer(child: ChildProcess, platform = process.platform): Promise<void> {
  if (!child.pid) return;
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  if (platform === "win32") {
    if (exited()) return;
    const result = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 10_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Could not stop the test server process tree.");
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  for (let attempt = 0; attempt < 100 && !exited(); attempt += 1) await delay(50);
  if (!exited()) {
    if (platform !== "win32") process.kill(-child.pid, "SIGKILL");
    throw new Error("The test server did not stop within five seconds.");
  }
}

/** Refuse to test an unrelated listener, and surface child failures before polling times out. */
export async function startServer(
  script: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; healthUrl: string; timeoutMs?: number },
): Promise<{ stop: () => Promise<void> }> {
  const url = new URL(options.healthUrl);
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(new Error(`Test port ${url.port} is unavailable; stop its existing server first.`)),
    );
    probe.listen(Number(url.port), url.hostname, () => probe.close((error) => (error ? reject(error) : resolve())));
  });
  const child = spawn(process.execPath, [script, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: "ignore",
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  let failure: Error | undefined;
  child.once("error", (error) => {
    failure = error;
  });
  const assertRunning = () => {
    if (failure) throw failure;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`The test server exited before it was ready (${child.exitCode ?? child.signalCode}).`);
  };
  try {
    const deadline = Date.now() + (options.timeoutMs ?? 60_000);
    while (Date.now() < deadline) {
      assertRunning();
      const ready = await fetch(url, { signal: AbortSignal.timeout(1000) }).then(
        (response) => response.ok,
        () => false,
      );
      assertRunning();
      if (ready) return { stop: () => stopServer(child) };
      await delay(250);
    }
    throw new Error("The test server did not become healthy before the startup timeout.");
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}
