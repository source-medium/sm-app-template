/** Resumable, non-secret owner setup. No hosting writes, tokens or persisted readiness claims. */
import { format, resolveConfig } from "prettier";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseConfig, describeConfig } from "../src/lib/config/env.server";
import { loadLocalEnvironment, root } from "./lib/environment";
import { credentialInstructions, EMPTY_PLAN, readWorkerConfig, requireProductionLive, SetupPlan } from "./lib/setup";

const file = join(root, "setup.json");
const workerFile = join(root, "wrangler.jsonc");
const [command = "status", ...args] = process.argv.slice(2);
if (["help", "--help", "-h"].includes(command)) {
  console.log(
    "pnpm app:setup plan --auth access|basic --data live|sample [--workspace name] [--viewers email,email] [--production https://…] [--preview https://…] [--production-build https://…] [--preview-build https://…]\npnpm app:setup status\npnpm app:setup credentials local|preview|production\nRecord non-secret intent only; enter credentials privately. See docs/setup.md.",
  );
  process.exit(0);
}
try {
  let plan = existsSync(file) ? SetupPlan.parse(JSON.parse(readFileSync(file, "utf8"))) : EMPTY_PLAN;
  if (command === "plan") {
    if (!args.length || args.length % 2)
      throw new Error(
        "Use pnpm app:setup plan --auth access|basic --data live|sample [--production https://…] [--preview https://…].",
      );
    const next = structuredClone(plan);
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1] ?? "";
      if (key === "--auth") next.auth = value as typeof next.auth;
      else if (key === "--data") next.data = value as typeof next.data;
      else if (key === "--workspace") next.workspace = value;
      else if (key === "--viewers")
        next.viewers = [
          ...new Set(
            value
              .split(",")
              .map((email) => email.trim())
              .filter(Boolean),
          ),
        ];
      else if (key === "--production" || key === "--preview")
        next[key.slice(2) as "production" | "preview"].url = value;
      else if (key === "--production-build" || key === "--preview-build")
        next[key.slice(2, -6) as "production" | "preview"].buildURL = value;
      else throw new Error("Unknown setup option. See docs/setup.md.");
    }
    plan = SetupPlan.parse(next);
    if (plan.data === "live" && !plan.auth)
      throw new Error("Choose --auth access or basic before connecting live data.");
    if (plan.data === "live")
      writeFileSync(
        workerFile,
        await format(requireProductionLive(readFileSync(workerFile, "utf8")), {
          ...(await resolveConfig(workerFile)),
          filepath: workerFile,
        }),
      );
    writeFileSync(file, await format(JSON.stringify(plan), { ...(await resolveConfig(file)), filepath: file }));
    console.log(
      plan.data === "live"
        ? "Saved live intent. Production will fail closed if its credential is missing. No host settings were changed."
        : "Saved sample intent. Existing live requirements are preserved. No host settings were changed.",
    );
  } else if (command !== "status" && command !== "credentials")
    throw new Error("Use pnpm app:setup plan, status or credentials local|preview|production.");
  const worker = readWorkerConfig(readFileSync(workerFile, "utf8"));
  if (command === "credentials") {
    const target = args[0];
    if (!target || !["local", "preview", "production"].includes(target) || args.length !== 1)
      throw new Error("Choose credentials local, preview or production.");
    console.log(
      credentialInstructions(plan.auth, target as "local" | "preview" | "production", worker.name).join("\n"),
    );
  } else {
    console.log(`Intent: ${plan.data} data; sign-in: ${plan.auth ?? "not chosen"}. Worker: ${worker.name}.`);
    if (plan.data === "live" && worker.vars?.APP_REQUIRE_LIVE !== "true")
      throw new Error(
        "Live intent requires root vars.APP_REQUIRE_LIVE=true in wrangler.jsonc. Rerun setup plan --data live.",
      );
    console.log(
      `Workspace: ${plan.workspace ?? "not recorded"}; ${plan.viewers.length} allowed viewer emails recorded. Verify the actual Access policy privately.`,
    );
    loadLocalEnvironment();
    console.log(`Local: ${describeConfig(parseConfig(process.env))}. Run pnpm diagnose to verify connectivity.`);
    let head = "";
    try {
      head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
      const remote = execFileSync("git", ["ls-remote", "origin", `refs/heads/${branch}`], {
        cwd: root,
        encoding: "utf8",
        timeout: 10_000,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .trim()
        .split(/\s/)[0];
      console.log(`Source: ${head.slice(0, 12)} ${remote === head ? "pushed" : "not confirmed on the remote branch"}.`);
    } catch {
      console.log("Source: remote push status unavailable.");
    }
    for (const target of ["preview", "production"] as const) {
      const entry = plan[target];
      console.log(`\n${target === "preview" ? "Branch preview" : "Production"}: ${entry.url ?? "URL not recorded"}`);
      if (entry.buildURL) console.log(`Build progress: ${entry.buildURL}`);
      if (entry.url) {
        try {
          const response = await fetch(new URL("/healthz", entry.url), {
            redirect: "manual",
            signal: AbortSignal.timeout(8_000),
          });
          const body =
            response.ok && response.headers.get("content-type")?.includes("application/json")
              ? await response.json()
              : null;
          console.log(
            body?.build === head.slice(0, 12)
              ? "Current commit deployed. Live verification pending."
              : body?.build
                ? "A different build is deployed. Current build is pending or failed; check the build link."
                : "Build identity unavailable, possibly behind sign-in. Deployment and live verification pending.",
          );
        } catch {
          console.log("Deployment not reachable. Check the build link.");
        }
        console.log(
          `Verify privately: ${new URL("/connection", entry.url).href} (build, sign-in, live mode, Check connection, then changed report).`,
        );
      }
      console.log(`Private entry instructions: pnpm app:setup credentials ${target}`);
    }
    console.log(
      "\nReadiness is observed each run, never saved. A push, build or sample page is not a verified live deployment. See docs/setup.md.",
    );
  }
} catch {
  // Zod/input errors can contain entered values. Emit only a fixed remedy.
  console.error(
    "Setup needs attention. Use a valid non-secret setup.json and the commands in docs/setup.md; live intent requires a sign-in choice and APP_REQUIRE_LIVE=true. No credentials should be entered in this command.",
  );
  process.exitCode = 1;
}
