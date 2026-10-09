/**
 * pnpm smoke:worker: run the built Worker (pnpm build:cloudflare) in workerd
 * and check the configuration modes and protected request paths end to end.
 * Live-mode tests use a generated, unregistered key and make no data requests.
 * Runtime values come from
 * temporary env files, never from your .dev.vars.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appConfig } from "../app.config";
import { root } from "./lib/environment";
import { liveEnv, makeServiceAccountKey } from "../tests/helpers/service-account";

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "SmokeTestPassword0123456789abc";
const FIRST = appConfig.nav[0]?.href ?? "/";
const LAST = appConfig.nav.at(-1)?.href ?? FIRST;
const dir = mkdtempSync(join(tmpdir(), "sm-smoke-"));

const access = "CF_ACCESS_TEAM_DOMAIN=example.cloudflareaccess.com\nCF_ACCESS_AUD=" + "a".repeat(64) + "\n";
const live =
  Object.entries(liveEnv(await makeServiceAccountKey(), { APP_BASIC_AUTH: undefined }))
    .filter((entry) => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n") + "\n";

const modes: { name: string; env: string; checks: [string, RequestInit, number, string?][] }[] = [
  {
    name: "public sample",
    env: "",
    checks: [
      ["/healthz", {}, 200],
      ["/connection", {}, 200, "Check connection"],
      ["/connection/check", { method: "POST", headers: { origin: BASE } }, 200, "sample"],
      ["/connection/check", { method: "POST", headers: { origin: "https://other.example" } }, 403],
      ["/data-dictionary?store=sample-store-a&relation=obt_orders", {}, 200, '"fields":'],
      [FIRST, {}, 200, "Sample data"],
      [LAST, {}, 200, "Sample data"],
      // An encoded # and & in one value must not cut or add parameters (the @opennextjs/aws patch).
      [`${LAST}?q=%23smoke%26%25store%3Devil&store=smoke`, {}, 200, `href="${FIRST}?store=smoke"`],
    ],
  },
  {
    name: "protected sample",
    env: `APP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [
      [FIRST, {}, 401],
      ["/connection", {}, 401],
      ["/connection/check", { method: "POST", headers: { origin: BASE } }, 401],
      ["/data-dictionary?store=sample-store-a&relation=obt_orders", {}, 401],
      [FIRST, { headers: { RSC: "1" } }, 401],
      [FIRST, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } }, 401],
      [FIRST, { method: "POST", headers: { "Next-Action": "x" } }, 401],
      [
        FIRST,
        { headers: { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" } },
        401,
      ],
      ["/%5Fnext/static/x", {}, 401],
      ["/HEALTHZ", {}, 401],
      ["/overview;x", {}, 401],
      ["/_next/static/../overview", {}, 401],
      ["/sample-creatives/creative-01.svg", {}, 401],
      ["/paid-marketing/export", {}, 401],
      [FIRST, { headers: { Authorization: `Basic ${btoa(`viewer:${PASSWORD}`)}` } }, 200, "Sample data"],
      // Files from public/ (and the build id) pass the guard too (run_worker_first in wrangler.jsonc).
      ["/BUILD_ID", {}, 401],
      ["/healthz", {}, 200],
    ],
  },
  { name: "sample Access", env: access, checks: [[FIRST, {}, 403]] },
  { name: "live Basic", env: live + `APP_BASIC_AUTH=viewer:${PASSWORD}\n`, checks: [[FIRST, {}, 401]] },
  { name: "live Access", env: live + access, checks: [[FIRST, {}, 403]] },
  { name: "live without guard", env: live, checks: [[FIRST, {}, 503, "APP_BASIC_AUTH"]] },
  { name: "both guards", env: access + `APP_BASIC_AUTH=viewer:${PASSWORD}\n`, checks: [[FIRST, {}, 503]] },
  {
    name: "partial Access domain",
    env: "CF_ACCESS_TEAM_DOMAIN=example.cloudflareaccess.com\n",
    checks: [[FIRST, {}, 503]],
  },
  { name: "partial Access audience", env: "CF_ACCESS_AUD=" + "a".repeat(64) + "\n", checks: [[FIRST, {}, 503]] },
  { name: "malformed Basic", env: "APP_BASIC_AUTH=viewer:short\n", checks: [[FIRST, {}, 503]] },
  {
    name: "partial live configuration",
    env: `SM_APPLICATION_ID=0b6f7a52-3c4e-4d1f-9a2b-1c2d3e4f5a6b\nAPP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [[FIRST, {}, 503, "SM_APP_KEY is missing"]],
  },
];

const signedIn = { Authorization: `Basic ${btoa(`viewer:${PASSWORD}`)}` };
const fixedStoreMode: (typeof modes)[number] = {
  name: "fixed-store sample",
  env: `APP_BASIC_AUTH=viewer:${PASSWORD}\nAPP_STORE_ID=sample-store-b\n`,
  checks: [
    [FIRST, {}, 401],
    [FIRST, { headers: signedIn }, 200, "Sample data"],
    [`${FIRST}?store=sample-store-b`, { headers: signedIn }, 200, "Sample data"],
    [`${FIRST}?store=sample-store-a`, { headers: signedIn }, 403, "This store is not available"],
    [`${FIRST}?store=sample-store-b&store=sample-store-a`, { headers: signedIn }, 403],
    [`${FIRST}?store=sample-store-a`, { headers: { ...signedIn, RSC: "1", "Next-Router-Prefetch": "1" } }, 403],
    [`${FIRST}?store=sample-store-a`, { method: "POST", headers: { ...signedIn, "Next-Action": "x" } }, 403],
    [
      `${FIRST}?store=sample-store-a`,
      { headers: { ...signedIn, "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" } },
      403,
    ],
    ["/paid-marketing/export?store=sample-store-a", { headers: signedIn }, 403],
    ["/data-dictionary?store=sample-store-a&relation=obt_orders", { headers: signedIn }, 403],
    ["/data-dictionary?store=sample-store-b&relation=obt_orders", { headers: signedIn }, 200, '"fields":'],
  ],
};
modes.push(fixedStoreMode, {
  name: "invalid store restriction",
  env: 'APP_STORE_ID=" invalid-store"\n',
  checks: [[FIRST, {}, 503, "APP_STORE_ID"]],
});

// The export belongs to the removable Paid marketing example.
if (appConfig.nav.some((item) => item.href === "/paid-marketing")) {
  const download = "/paid-marketing/export?store=sample-store-a&from=2026-09-01&to=2026-09-07&channel=Meta";
  modes[0]?.checks.push([download, {}, 200, '"data_mode","store_id"']);
  modes[1]?.checks.push([
    download,
    { headers: { Authorization: `Basic ${btoa(`viewer:${PASSWORD}`)}` } },
    200,
    '"sample","sample-store-a"',
  ]);
  fixedStoreMode.checks.push([
    "/paid-marketing/export?from=2026-09-01&to=2026-09-07&channel=Meta",
    { headers: signedIn },
    200,
    '"sample","sample-store-b"',
  ]);
}

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
    const worker = spawn(
      wrangler,
      ["dev", "--port", String(PORT), "--ip", "127.0.0.1", "--inspector-port", "0", "--env-file", envFile],
      {
        cwd: root,
        stdio: "ignore",
        detached: true,
      },
    );
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
