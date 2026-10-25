/** Owner tooling only. This file never enters the reporting app's runtime. */
import ts from "typescript";
import { z } from "zod";

const hostedURL = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
    );
  }, "Use an HTTPS origin without credentials, a path or a query.");
const buildURL = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  });
const target = z.object({ url: hostedURL.nullable(), buildURL: buildURL.nullable() }).strict();
export const SetupPlan = z
  .object({
    version: z.literal(1),
    auth: z.enum(["access", "basic"]).nullable(),
    data: z.enum(["sample", "live"]),
    workspace: z.string().min(1).max(200).nullable().default(null),
    viewers: z.array(z.email()).max(100).default([]),
    production: target,
    preview: target,
  })
  .strict();
export type SetupPlan = z.output<typeof SetupPlan>;
export const EMPTY_PLAN: SetupPlan = {
  version: 1,
  auth: null,
  data: "sample",
  workspace: null,
  viewers: [],
  production: { url: null, buildURL: null },
  preview: { url: null, buildURL: null },
};

export function readWorkerConfig(text: string): { name: string; vars?: Record<string, string> } {
  const result = ts.parseConfigFileTextToJson("wrangler.jsonc", text);
  if (
    result.error ||
    !result.config ||
    typeof result.config.name !== "string" ||
    !/^[a-z0-9][a-z0-9-]*$/.test(result.config.name)
  )
    throw new Error("Check the Worker name and JSON syntax in wrangler.jsonc.");
  return result.config;
}

/**
 * What live intent still lacks: a sign-in choice, and root vars.APP_REQUIRE_LIVE=true
 * in `worker` (wrangler.jsonc; lacking when not given). Sample intent lacks neither.
 */
export function liveIntentGaps(
  plan: Pick<SetupPlan, "data" | "auth">,
  worker?: { vars?: Record<string, string> },
): { auth: boolean; requireLive: boolean } {
  const live = plan.data === "live";
  return { auth: live && !plan.auth, requireLive: live && worker?.vars?.APP_REQUIRE_LIVE !== "true" };
}

/** Runs one git command in the checkout and returns its trimmed output; throws when git fails. */
type GitRunner = (args: string[]) => string;

/**
 * Whether HEAD is on the remote branch the current branch tracks. The remote
 * is the branch's own upstream, never a fixed name: the Artifacts setup
 * (docs/cloud.md) keeps `origin` as the upstream template and pushes the
 * customer's code to `cloudflare`. Without an upstream the answer is unknown,
 * not unpushed.
 */
export function sourcePushStatus(git: GitRunner): { head: string | null; line: string } {
  let head: string;
  try {
    head = git(["rev-parse", "HEAD"]);
  } catch {
    return { head: null, line: "Source: remote push status unavailable." };
  }
  const source = `Source: ${head.slice(0, 12)}`;
  try {
    let branch: string;
    try {
      branch = git(["symbolic-ref", "-q", "HEAD"]);
    } catch {
      return { head, line: `${source}; detached HEAD, so push status is unknown.` };
    }
    const [remote, remoteRef] = git([
      "for-each-ref",
      "--format=%(upstream:remotename) %(upstream:remoteref)",
      branch,
    ]).split(" ");
    if (!remote || !remoteRef)
      return {
        head,
        line: `${source}; this branch tracks no remote branch, so push status is unknown. Push it with git push -u <remote> <branch>.`,
      };
    const target = `${remote}/${remoteRef.replace(/^refs\/heads\//, "")}`;
    const pushed = git(["ls-remote", remote, remoteRef]).split(/\s/)[0];
    return { head, line: `${source} ${pushed === head ? `pushed to ${target}` : `not confirmed on ${target}`}.` };
  } catch {
    return { head, line: `${source}; remote push status unavailable.` };
  }
}

/** Edit only the root live intent, preserving the customer's JSONC and every other setting. */
export function requireProductionLive(text: string): string {
  readWorkerConfig(text);
  const source = ts.parseJsonText("wrangler.jsonc", text);
  const object = (source.statements[0] as ts.ExpressionStatement).expression as ts.ObjectLiteralExpression;
  const vars = object.properties.find((p) => p.name && ts.isStringLiteral(p.name) && p.name.text === "vars");
  if (vars && ts.isPropertyAssignment(vars) && ts.isObjectLiteralExpression(vars.initializer)) {
    const live = vars.initializer.properties.find(
      (p) => p.name && ts.isStringLiteral(p.name) && p.name.text === "APP_REQUIRE_LIVE",
    );
    if (live && ts.isPropertyAssignment(live)) {
      return text.slice(0, live.initializer.getStart(source)) + '"true"' + text.slice(live.initializer.end);
    }
    const position = vars.initializer.getStart(source) + 1;
    return text.slice(0, position) + '\n      "APP_REQUIRE_LIVE": "true",' + text.slice(position);
  }
  if (vars) throw new Error("The root vars setting must be a JSON object.");
  const position = object.getStart(source) + 1;
  return text.slice(0, position) + '\n  "vars": { "APP_REQUIRE_LIVE": "true" },' + text.slice(position);
}

export function credentialInstructions(
  auth: SetupPlan["auth"],
  target: "local" | "preview" | "production",
  worker: string,
): string[] {
  const where =
    target === "local"
      ? ".env.local (Development app)"
      : target === "preview"
        ? `${worker}-preview → Settings → Previews Base (Development app)`
        : `${worker} → Settings → Variables and Secrets (Production app)`;
  if (!auth && target !== "local")
    return ["Choose --auth access or basic with pnpm app:setup plan before entering hosted credentials."];
  return [
    `Private entry: ${where}.`,
    ...(auth === "access" && target !== "local"
      ? [
          "Add SM_CONNECTION as an encrypted secret, using only its value from the issued block.",
          "Keep CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD from your Access application. Remove APP_BASIC_AUTH if present.",
          "Do not paste the whole issued block: its shared password conflicts with Access.",
        ]
      : ["Enter SM_CONNECTION and APP_BASIC_AUTH privately from the issued block."]),
    ...(target !== "local"
      ? ["Save and deploy. Existing previews need their own settings updated or a newly created preview."]
      : []),
    "Never paste a configuration block into chat. Run Connection after signing in; configuration alone is not verification.",
  ];
}
