/**
 * pnpm smoke:worker: run the built Worker (pnpm build:cloudflare) in workerd
 * and check the configuration modes and protected request paths end to end.
 * Live-mode tests use a generated, unregistered key and make no data requests.
 * Runtime values come from test bindings, never from your local app settings.
 */
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createTestHarness, unstable_readConfig } from "wrangler";
import { appConfig } from "../app.config";
import { root } from "./lib/environment";
import { sampleEnvironment } from "./lib/sample-env";
import { liveEnv, makeServiceAccountKey } from "../tests/helpers/service-account";

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = "SmokeTestPassword0123456789abc";
const signedIn = { Authorization: `Basic ${btoa(`viewer:${PASSWORD}`)}` };
const FIRST = appConfig.nav[0]?.href ?? "/";
const LAST = appConfig.nav.at(-1)?.href ?? FIRST;

const access = "CF_ACCESS_TEAM_DOMAIN=example.cloudflareaccess.com\nCF_ACCESS_AUD=" + "a".repeat(64) + "\n";
const dataValues = Object.fromEntries(
  Object.entries(liveEnv(await makeServiceAccountKey(), { APP_BASIC_AUTH: undefined })).filter(
    (entry) => entry[1] !== undefined,
  ),
);
const connection = `SM_CONNECTION=${btoa(JSON.stringify({ version: 1, values: dataValues }))}\n`;
const live =
  Object.entries(dataValues)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n") + "\n";

type Mode = {
  name: string;
  env: string;
  workerEnv?: "preview";
  checks: [string, { method?: string; headers?: Record<string, string> }, number, string?][];
};
const modes: Mode[] = [
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
      [FIRST, { headers: signedIn }, 200, "Sample data"],
      // Files from public/ (and the build id) pass the guard too (run_worker_first in wrangler.jsonc).
      ["/BUILD_ID", {}, 401],
      ["/healthz", {}, 200],
      // The app icon carries no data and loads before a viewer signs in.
      ["/icon.svg", {}, 200, "<svg"],
      ["/ICON.SVG", {}, 401],
      ["/x/icon.svg", {}, 401],
    ],
  },
  { name: "sample Access", env: access, checks: [[FIRST, {}, 403]] },
  { name: "live Basic", env: live + `APP_BASIC_AUTH=viewer:${PASSWORD}\n`, checks: [[FIRST, {}, 401]] },
  { name: "live Access", env: live + access, checks: [[FIRST, {}, 403]] },
  { name: "live without guard", env: live, checks: [[FIRST, {}, 503, "APP_BASIC_AUTH"]] },
  {
    name: "preview missing configuration",
    workerEnv: "preview",
    env: "",
    checks: [
      ["/healthz", {}, 200],
      [FIRST, {}, 503, "requires live data"],
      [FIRST, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } }, 503],
      ["/data-dictionary?store=sample-store-a&relation=obt_orders", {}, 503],
      ["/sample-creatives/creative-01.svg", {}, 503],
    ],
  },
  {
    name: "preview live Basic",
    workerEnv: "preview",
    env: live + `APP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [[FIRST, {}, 401]],
  },
  {
    name: "preview live without guard",
    workerEnv: "preview",
    env: live,
    checks: [[FIRST, {}, 503, "APP_BASIC_AUTH"]],
  },
  {
    name: "connection Basic",
    env: connection + `APP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [
      [FIRST, {}, 401],
      ["/connection", {}, 401],
      ["/paid-marketing/export", {}, 401],
      ["/connection", { headers: signedIn }, 200, "Live data"],
    ],
  },
  { name: "connection Access", env: connection + access, checks: [[FIRST, {}, 403]] },
  {
    name: "preview connection Basic",
    workerEnv: "preview",
    env: connection + `APP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [[FIRST, {}, 401]],
  },
  {
    name: "connection without guard",
    env: connection,
    checks: [[FIRST, {}, 503, "APP_BASIC_AUTH"]],
  },
  {
    name: "malformed connection",
    env: `SM_CONNECTION=invalid\nAPP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [[FIRST, {}, 503, "SM_CONNECTION"]],
  },
  {
    name: "mixed connection formats",
    env: connection + live + `APP_BASIC_AUTH=viewer:${PASSWORD}\n`,
    checks: [[FIRST, {}, 503, "not both"]],
  },
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
  modes[1]?.checks.push([download, { headers: signedIn }, 200, '"sample","sample-store-a"']);
  fixedStoreMode.checks.push([
    "/paid-marketing/export?from=2026-09-01&to=2026-09-07&channel=Meta",
    { headers: signedIn },
    200,
    '"sample","sample-store-b"',
  ]);
}

// New examples exercise real Workers rendering/downloads and the same fixed-store guard.
for (const [feature, path, content] of [
  ["/geography", "/geography", "Shipping destinations"],
  ["/geography", "/geography/export", '"valid_orders"'],
  ["/overview", "/overview/export.json", '"report":"overview"'],
  ["/data", "/data", "Data health"],
] as const) {
  if (!appConfig.nav.some((item) => item.href === feature)) continue;
  const scope = "from=2026-09-01&to=2026-09-07";
  modes[0]?.checks.push([`${path}?store=sample-store-a&${scope}`, {}, 200, content]);
  modes[1]?.checks.push([path, {}, 401]);
  fixedStoreMode.checks.push([`${path}?store=sample-store-a&${scope}`, { headers: signedIn }, 403]);
  fixedStoreMode.checks.push([`${path}?${scope}`, { headers: signedIn }, 200, content]);
}

const failures: string[] = [];
const configPath = join(root, "wrangler.jsonc");
const configs = {
  production: unstable_readConfig({ config: configPath }),
  preview: unstable_readConfig({ config: configPath, env: "preview" }),
};
const worker = createTestHarness();
try {
  for (const mode of modes) {
    // Replace all app bindings on every reload, retaining the environment's
    // configured defaults (including preview's APP_REQUIRE_LIVE). Explicit
    // secrets override local dotenv files without changing the real config.
    const defaults = Object.fromEntries(
      Object.entries(configs[mode.workerEnv ?? "production"].vars).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    const secrets = { ...sampleEnvironment, ...defaults };
    for (const [name, value] of Object.entries(parseEnv(mode.env))) {
      if (value !== undefined) secrets[name] = value;
    }
    await worker.update({
      root,
      workers: [
        {
          configPath,
          env: mode.workerEnv,
          secrets,
        },
      ],
    });
    await worker.listen();
    for (const [path, init, status, text] of mode.checks) {
      const response = await worker.fetch(`${BASE}${path}`, init);
      const body = await response.text();
      const ok = response.status === status && (!text || body.includes(text));
      console.log(`${ok ? "✓" : "✗"} ${mode.name}: ${path} → ${response.status}`);
      if (!ok)
        failures.push(
          `${mode.name}: ${path} answered ${response.status}, expected ${status}${text ? ` containing "${text}"` : ""}.`,
        );
    }
  }
} finally {
  await worker.close();
}
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log("Worker smoke passed in workerd.");
