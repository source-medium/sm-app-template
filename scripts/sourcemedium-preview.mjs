/**
 * Sends this commit to SourceMedium, which builds it as a private preview of
 * your SourceMedium-hosted app (docs/managed.md#change-a-hosted-app). A
 * workspace admin opens and publishes previews in SourceMedium; nothing here
 * changes what your team sees.
 *
 * It runs in GitHub Actions (.github/workflows/sourcemedium.yml) with no
 * secret: GitHub signs a short-lived identity token naming this repository
 * and commit, and SourceMedium checks it. Nothing is sent unless SourceMedium
 * says this repository is connected to an app, so a self-hosted copy of the
 * template sends no code.
 *
 *   node scripts/sourcemedium-preview.mjs
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_SOURCEMEDIUM_URL = "https://urchin.sourcemedium.com";
const POLL_MS = 15_000;
const WAIT_MS = 25 * 60_000;

/** SourceMedium's origin: the token's audience and the API's base. */
export function sourcemediumOrigin(value) {
  const url = new URL(value || DEFAULT_SOURCEMEDIUM_URL);
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("SOURCEMEDIUM_URL must be an https URL.");
  return url.origin;
}

async function identityToken(env, audience, request) {
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
    throw new Error("The workflow needs `permissions: id-token: write` to prove this repository to SourceMedium.");
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set("audience", audience);
  const response = await request(url, {
    headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
  });
  if (!response.ok) throw new Error(`GitHub did not issue an identity token (${response.status}).`);
  const { value } = await response.json();
  if (typeof value !== "string") throw new Error("GitHub returned no identity token.");
  return value;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * The whole run, with every outside effect passed in so it can be tested.
 * Returns the process exit code.
 */
export async function runPreview({ env, fetch: request, archive, sleep, log, summary, now = Date.now }) {
  const origin = sourcemediumOrigin(env.SOURCEMEDIUM_URL);
  const call = async (path, init = {}) =>
    request(`${origin}/api/app-sources/v1/${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${await identityToken(env, origin, request)}` },
    });

  const repository = await call("repository");
  const connection = await readJson(repository);
  if (repository.status === 503 || (repository.ok && connection.connected === false)) {
    log("::notice::This repository isn't connected to a SourceMedium-hosted app, so nothing was sent.");
    return 0;
  }
  if (!repository.ok) {
    log(`::error::SourceMedium refused this repository: ${connection.error?.message ?? repository.status}`);
    return 1;
  }

  const upload = await call("builds", {
    method: "POST",
    headers: { "Content-Type": "application/gzip" },
    body: archive(),
  });
  const accepted = await readJson(upload);
  if (!upload.ok || typeof accepted.build?.id !== "string") {
    log(`::error::SourceMedium did not accept this commit: ${accepted.error?.message ?? upload.status}`);
    return 1;
  }
  const id = accepted.build.id;
  log(
    `Sent ${env.GITHUB_SHA?.slice(0, 12) ?? "this commit"} to SourceMedium for ${connection.app?.name ?? "your app"}. Building...`,
  );

  const deadline = now() + WAIT_MS;
  let last = "";
  while (now() < deadline) {
    const response = await call(`builds/${id}`);
    const { build, error } = await readJson(response);
    if (!response.ok || !build) {
      log(`::error::SourceMedium could not report this build: ${error?.message ?? response.status}`);
      return 1;
    }
    const step = `${build.build}/${build.state}`;
    if (step !== last) log(`SourceMedium: ${build.state.replaceAll("_", " ")} (build ${build.build})`);
    last = step;
    if (build.state === "ready") {
      const lines = [
        `Preview ready: https://${build.previewHostname}/`,
        "Workspace admins and editors can open it, signed in to SourceMedium. A workspace admin publishes it from App settings.",
      ];
      for (const line of lines) log(line);
      summary(`### SourceMedium preview\n\n${lines.join("\n\n")}\n`);
      return 0;
    }
    if (build.state === "failed") {
      if (build.build === "cancelled") {
        log(`::notice::${build.error?.detail ?? "This build was replaced."}`);
        return 0;
      }
      if (build.log) log(build.log);
      log(`::error::${build.error?.detail ?? "SourceMedium could not build this commit."}`);
      return 1;
    }
    await sleep(POLL_MS);
  }
  log("::error::SourceMedium is still working on this build. Check App settings in SourceMedium.");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runPreview({
    env: process.env,
    fetch,
    archive: () => {
      const result = spawnSync("git", ["archive", "--format=tar.gz", "HEAD"], {
        maxBuffer: 20 * 1024 * 1024,
      });
      if (result.status !== 0) throw new Error("git archive failed");
      return result.stdout;
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(line),
    summary: (text) => {
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
    },
  }).catch((error) => {
    console.log(`::error::${error.message}`);
    return 1;
  });
  process.exitCode = exitCode;
}
