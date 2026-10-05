/**
 * pnpm smoke:worker: run the built Worker (pnpm build:cloudflare) in workerd
 * and check each configuration mode end to end: public sample, protected
 * sample, and a partial live configuration (503). Runtime values come from
 * temporary env files, never from your .dev.vars.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root } from "./lib/environment";

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "SmokeTestPassword0123456789abc";
const dir = mkdtempSync(join(tmpdir(), "sm-smoke-"));

const modes: { name: string; env: string; checks: [string, RequestInit, number, string?][] }[] = [
  {
    name: "public sample",
    env: "",
    checks: [
      ["/healthz", {}, 200],
      ["/overview", {}, 200, "Sample data"],
      ["/orders", {}, 200, "Sample data"],
    ],
  },
  {
    name: "protected sample",
    env: `APP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [
      ["/overview", {}, 401],
      ["/overview", { headers: { RSC: "1" } }, 401],
      ["/overview", { headers: { Authorization: `Basic ${btoa(`viewer:${PASSWORD}`)}` } }, 200, "Sample data"],
      ["/healthz", {}, 200],
    ],
  },
  {
    name: "partial live configuration",
    env: `SM_APPLICATION_ID=0b6f7a52-3c4e-4d1f-9a2b-1c2d3e4f5a6b\nAPP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [["/overview", {}, 503, "SM_APP_KEY is missing"]],
  },
];

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (
      await fetch(`${BASE}/healthz`).then(
        (response) => response.ok,
        () => false,
      )
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The Worker did not start; run `pnpm build:cloudflare` first and check that port 8791 is free.");
}

/** Stops the Worker's process group; it may already have exited. */
function stop(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

const failures: string[] = [];
try {
  for (const mode of modes) {
    const envFile = join(dir, `${mode.name.replace(/\s+/g, "-")}.env`);
    writeFileSync(envFile, mode.env);
    const wrangler = join(root, "node_modules/.bin/wrangler");
    const worker = spawn(wrangler, ["dev", "--port", String(PORT), "--ip", "127.0.0.1", "--env-file", envFile], {
      cwd: root,
      stdio: "ignore",
      detached: true,
    });
    try {
      await waitForServer();
      for (const [path, init, status, text] of mode.checks) {
        const response = await fetch(`${BASE}${path}`, init);
        const body = await response.text();
        const ok = response.status === status && (!text || body.includes(text));
        console.log(`${ok ? "✓" : "✗"} ${mode.name}: ${path} → ${response.status}`);
        if (!ok)
          failures.push(
            `${mode.name}: ${path} answered ${response.status}, expected ${status}${text ? ` containing "${text}"` : ""}.`,
          );
      }
    } finally {
      stop(worker.pid);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log("Worker smoke passed in workerd.");
