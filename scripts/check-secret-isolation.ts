/**
 * pnpm test:secrets: build with sentinel
 * credentials in the environment, then prove none reach the browser.
 *
 *   1. The sanitized Cloudflare build with a full live sentinel configuration
 *      in the build environment; scan the Worker, client bundle, and pages.
 *   2. `next start` in live mode (sentinel key) and in protected sample mode;
 *      fetch every view's HTML and RSC payload, and the challenge, and scan.
 *
 * The scan also checks injected environment credentials and local env files,
 * which `next build` reads (a NEXT_PUBLIC_ copy would be inlined).
 *
 * Builds into .next and .open-next, so stop `pnpm dev` first. Browser and
 * Worker tests reuse these outputs; deployment uploads the checked artifact.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appConfig } from "../app.config";
import { buildFiles, configuredSecretValues, root } from "./lib/environment";
import { sampleEnvironment as cleared } from "./lib/sample-env";
import { nextCli, startServer } from "./lib/test-server";
import { testPortOffset } from "./lib/test-ports";

const PORT = 3107 + testPortOffset();
const PASSWORD = "SentinelPasswordDoNotShip0123456789";
const APP_ID = "5e1e4e1e-0000-4000-8000-5e1e4e1e0000";

async function sentinelKey(): Promise<{ base64: string; pemFragment: string }> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  const json = {
    type: "service_account",
    project_id: "sm-sentinel-project",
    private_key_id: "5e1e4e1e5e1e4e1e5e1e4e1e5e1e4e1e5e1e4e1e",
    private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n`,
    client_email: "app-sentinel0123@sm-sentinel-project.iam.gserviceaccount.com",
  };
  return { base64: Buffer.from(JSON.stringify(json)).toString("base64"), pemFragment: pkcs8.slice(100, 160) };
}

const key = await sentinelKey();
const liveEnv = {
  SM_APPLICATION_ID: APP_ID,
  SM_APP_KEY: key.base64,
  BIGQUERY_JOB_PROJECT_ID: "sm-sentinel-project",
  BIGQUERY_LOCATION: "US",
  SM_DATA_PROJECT_ID: "sm-sentinel-data",
  SM_TRANSFORMED_DATASET_ID: "sm_transformed_v2",
  SM_METADATA_DATASET_ID: "sm_metadata",
  APP_BASIC_AUTH: `viewer:${PASSWORD}`,
};
const { APP_BASIC_AUTH, ...dataValues } = liveEnv;
const connection = Buffer.from(JSON.stringify({ version: 1, values: dataValues })).toString("base64");
const connectionEnv = { SM_CONNECTION: connection, APP_BASIC_AUTH };
const sentinels = [
  PASSWORD,
  key.base64.slice(40, 120),
  key.pemFragment,
  connection,
  connection.slice(40, 120),
  ...configuredSecretValues(),
];
const leaks: string[] = [];
const scan = (label: string, text: string) => {
  for (const sentinel of sentinels) if (text.includes(sentinel)) leaks.push(label);
};

console.log("Building with sentinel credentials in the build environment...");
const build = spawnSync("pnpm", ["build:cloudflare"], {
  cwd: root,
  env: { ...process.env, ...cleared, ...connectionEnv },
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const outputs = [
  ...buildFiles(join(root, ".open-next")),
  ...buildFiles(join(root, ".next/static")).filter((path) => /\.(js|css|map|json)$/.test(path)),
  ...buildFiles(join(root, ".next/server/app")).filter((path) => /\.(html|rsc|body|meta|map)$/.test(path)),
];
for (const path of outputs) scan(path.slice(root.length + 1), readFileSync(path, "utf8"));
console.log(`Scanned ${outputs.length} build files.`);

const base = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Basic ${Buffer.from(`viewer:${PASSWORD}`).toString("base64")}` };

/**
 * Two servers from the same build. Live mode holds the sentinel key; Google
 * rejects it, so pages render their error states. Protected sample mode
 * renders every page in full. A successfully rendered live page needs a
 * working warehouse, which this offline check does not have.
 */

const modes = [
  { name: "live (connection bundle)", env: connectionEnv, expect: "Live data" },
  { name: "live (sentinel key)", env: liveEnv, expect: "Live data" },
  { name: "protected sample", env: { APP_BASIC_AUTH: `viewer:${PASSWORD}` }, expect: "Sample data" },
];

let pages = 0;
for (const mode of modes) {
  console.log(`Serving in ${mode.name} mode...`);
  const server = await startServer(nextCli, ["start", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: root,
    env: { ...process.env, ...cleared, ...mode.env },
    healthUrl: `${base}/healthz`,
    timeoutMs: 30_000,
  });
  try {
    let sawMode = false;
    // With ?store= a view renders its body even when the store list fails, as it does with the sentinel key.
    const views = appConfig.nav.flatMap((item) => [item.href, `${item.href}?store=sentinel-store`]);
    for (const path of [...views, "/does-not-exist"]) {
      for (const headers of [auth, { ...auth, RSC: "1" }, {}]) {
        const response = await fetch(`${base}${path}`, { headers });
        const body = await response.text();
        sawMode ||= body.includes(mode.expect);
        scan(`${mode.name} ${path} (${response.status}${"RSC" in headers ? ", RSC" : ""})`, body);
        pages += 1;
      }
    }
    if (!sawMode) {
      console.error(
        `The server never rendered ${mode.name} mode, so its scan proves nothing; check this script's configuration.`,
      );
      process.exitCode = 1;
    }
  } finally {
    await server.stop();
  }
}
console.log(`Scanned ${pages} rendered responses.`);

if (leaks.length > 0) {
  console.error(
    `A sentinel or configured credential reached browser-facing output: ${[...new Set(leaks)].join(", ")}. Find where the value is read and keep it in a *.server.ts module.`,
  );
  process.exit(1);
}
console.log(
  "secret-isolation: no sentinel credential in the Worker, client bundle, source maps, prerendered pages, or rendered responses.",
);
