/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * The one runtime configuration parser. The server, the middleware, the
 * doctor, and the tests all derive the app's mode from parseConfig(); nothing
 * else reads process.env. Configuration is read per request, never at build
 * time or module evaluation, so a build carries no credentials.
 *
 * Modes (docs/connect.md):
 *   no live values,  no guard          -> public sample
 *   no live values,  one valid guard   -> protected sample
 *   APP_REQUIRE_LIVE=true, no live values -> error (hosted previews)
 *   all seven live,  one valid guard   -> live, protected
 *   some live values, or a bad value   -> error (no query, no sample fallback)
 *   all seven live,  no guard          -> error, including on localhost
 *   partial Access pair, bad Basic, or both guards -> error
 */
import "server-only";

export const LIVE_VARIABLES = [
  "SM_APPLICATION_ID",
  "SM_APP_KEY",
  "BIGQUERY_JOB_PROJECT_ID",
  "BIGQUERY_LOCATION",
  "SM_DATA_PROJECT_ID",
  "SM_TRANSFORMED_DATASET_ID",
  "SM_METADATA_DATASET_ID",
] as const;

export const DEFAULT_MAX_BYTES_BILLED = 1024n * 1024n * 1024n; // 1 GiB

export type ServiceAccountKey = {
  clientEmail: string;
  privateKeyId: string;
  privateKeyPem: string;
  projectId: string;
};

export type LiveConfig = {
  applicationId: string;
  key: ServiceAccountKey;
  jobProjectId: string;
  location: string;
  dataProjectId: string;
  transformedDatasetId: string;
  metadataDatasetId: string;
  maxBytesBilled: bigint;
};

export type GuardConfig =
  { kind: "basic"; username: string; password: string } | { kind: "access"; teamDomain: string; audience: string };

/** One problem per variable, as one sentence naming the fix. Never a value. */
export type ConfigProblem = { variable: string; message: string };

export type AppConfig =
  | { status: "ok"; mode: "sample"; guard: GuardConfig | null; storeId: string | null }
  | { status: "ok"; mode: "live"; guard: GuardConfig; live: LiveConfig; storeId: string | null }
  | { status: "error"; problems: ConfigProblem[] };

type Env = Readonly<Record<string, string | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
/** A BigQuery dataset or table id: letters, digits and underscores. */
export const BIGQUERY_IDENTIFIER = /^[A-Za-z0-9_]{1,1024}$/;
// Multi-regions (US, EU) and regions (us-central1, northamerica-northeast1).
const LOCATION = /^(?:[A-Za-z]{2}|[a-z]+(?:-[a-z]+)+[0-9]+)$/;
const BASIC_VALUE = /^([A-Za-z0-9._-]{1,64}):([A-Za-z0-9_-]{24,128})$/;
const ACCESS_TEAM_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/;
const ACCESS_AUDIENCE = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,18}$/;
const SERVICE_ACCOUNT_EMAIL =
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/;
const PRIVATE_KEY_ID = /^[a-f0-9]{40}$/;
const MAX_KEY_LENGTH = 16_384;

const RECOPY = "check the issued configuration block with your SourceMedium admin (docs/connect.md)";

/** Whitespace-only counts as missing. */
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function parseConfig(env: Env): AppConfig {
  const problems: ConfigProblem[] = [];
  const guard = parseGuard(env, problems);
  const guardProblems = problems.length;
  const present = LIVE_VARIABLES.filter((name) => read(env, name) !== undefined);
  const maxBytesBilled = parseMaxBytesBilled(env, problems);
  const storeId = parseStoreId(env, problems);
  const requireLive = read(env, "APP_REQUIRE_LIVE");
  if (requireLive !== undefined && requireLive !== "true" && requireLive !== "false") {
    problems.push({ variable: "APP_REQUIRE_LIVE", message: "APP_REQUIRE_LIVE must be true or false." });
  }

  if (present.length === 0) {
    if (requireLive === "true") {
      problems.push({
        variable: "APP_REQUIRE_LIVE",
        message:
          "This deployment requires live data. Add the complete SourceMedium configuration block and viewer guard to its runtime settings. For a branch preview, configure Previews Base before creating it; existing previews need their own settings updated. See docs/cloud.md#connect-preview-data.",
      });
    }
    return problems.length > 0 ? { status: "error", problems } : { status: "ok", mode: "sample", guard, storeId };
  }

  if (present.length < LIVE_VARIABLES.length) {
    for (const name of LIVE_VARIABLES) {
      if (!present.includes(name)) {
        problems.push({
          variable: name,
          message: `${name} is missing while other live values are set; paste the complete configuration block${requireLive === "true" ? "." : ", or remove every live value to use sample data."}`,
        });
      }
    }
    return { status: "error", problems };
  }

  const live = parseLive(env, maxBytesBilled, problems);
  if (!guard && guardProblems === 0) {
    problems.push({
      variable: "APP_BASIC_AUTH",
      message:
        "Live data needs a viewer guard, including on localhost; set APP_BASIC_AUTH from your configuration block, or set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD.",
    });
  }
  if (problems.length > 0 || !live || !guard) return { status: "error", problems };
  return { status: "ok", mode: "live", guard, live, storeId };
}

function parseStoreId(env: Env, problems: ConfigProblem[]): string | null {
  const value = env.APP_STORE_ID;
  if (value === undefined || value === "") return null;
  if (value.length > 200 || value.trim() !== value || /\p{Cc}/u.test(value)) {
    problems.push({
      variable: "APP_STORE_ID",
      message:
        "APP_STORE_ID must be one exact store id, at most 200 characters, without surrounding whitespace or control characters; see docs/auth.md.",
    });
    return null;
  }
  return value;
}

function parseGuard(env: Env, problems: ConfigProblem[]): GuardConfig | null {
  const basic = read(env, "APP_BASIC_AUTH");
  const teamDomain = read(env, "CF_ACCESS_TEAM_DOMAIN");
  const audience = read(env, "CF_ACCESS_AUD");
  const accessTouched = teamDomain !== undefined || audience !== undefined;

  if (basic !== undefined && accessTouched) {
    problems.push({
      variable: "APP_BASIC_AUTH",
      message:
        "Both the shared password and Cloudflare Access are configured; keep one, and remove APP_BASIC_AUTH when you switch to Access.",
    });
    return null;
  }

  if (basic !== undefined) {
    const match = BASIC_VALUE.exec(basic);
    if (!match?.[1] || !match[2]) {
      problems.push({
        variable: "APP_BASIC_AUTH",
        message: `APP_BASIC_AUTH must be user:password with a password of at least 24 letters, digits, - or _; ${RECOPY}.`,
      });
      return null;
    }
    return { kind: "basic", username: match[1], password: match[2] };
  }

  if (!accessTouched) return null;
  let valid = true;
  if (teamDomain === undefined || !ACCESS_TEAM_DOMAIN.test(teamDomain)) {
    valid = false;
    problems.push({
      variable: "CF_ACCESS_TEAM_DOMAIN",
      message:
        "CF_ACCESS_TEAM_DOMAIN must be your Access team domain, like yourteam.cloudflareaccess.com, with no https:// prefix; see docs/auth.md.",
    });
  }
  if (audience === undefined || !ACCESS_AUDIENCE.test(audience)) {
    valid = false;
    problems.push({
      variable: "CF_ACCESS_AUD",
      message:
        "CF_ACCESS_AUD must be the 64-character Application Audience (AUD) tag from your Access application; see docs/auth.md.",
    });
  }
  return valid && teamDomain && audience ? { kind: "access", teamDomain, audience } : null;
}

function parseMaxBytesBilled(env: Env, problems: ConfigProblem[]): bigint {
  const raw = read(env, "BIGQUERY_MAX_BYTES_BILLED");
  if (raw === undefined) return DEFAULT_MAX_BYTES_BILLED;
  if (!POSITIVE_INTEGER.test(raw)) {
    problems.push({
      variable: "BIGQUERY_MAX_BYTES_BILLED",
      message:
        "BIGQUERY_MAX_BYTES_BILLED must be a positive whole number of bytes; remove it to use the 1 GiB default.",
    });
    return DEFAULT_MAX_BYTES_BILLED;
  }
  return BigInt(raw);
}

function parseLive(env: Env, maxBytesBilled: bigint, problems: ConfigProblem[]): LiveConfig | null {
  const value = (name: (typeof LIVE_VARIABLES)[number]) => read(env, name) ?? "";
  const check = (name: (typeof LIVE_VARIABLES)[number], pattern: RegExp, what: string) => {
    if (!pattern.test(value(name))) {
      problems.push({ variable: name, message: `${name} is not ${what}; ${RECOPY}.` });
    }
  };

  check("SM_APPLICATION_ID", UUID, "a lowercase app UUID");
  check("BIGQUERY_JOB_PROJECT_ID", PROJECT_ID, "a Google Cloud project id");
  check("SM_DATA_PROJECT_ID", PROJECT_ID, "a Google Cloud project id");
  check("BIGQUERY_LOCATION", LOCATION, "a BigQuery location such as US or us-central1");
  check("SM_TRANSFORMED_DATASET_ID", BIGQUERY_IDENTIFIER, "a BigQuery dataset id");
  check("SM_METADATA_DATASET_ID", BIGQUERY_IDENTIFIER, "a BigQuery dataset id");

  const key = parseServiceAccountKey(value("SM_APP_KEY"));
  if (typeof key === "string") {
    problems.push({ variable: "SM_APP_KEY", message: `SM_APP_KEY ${key}; ${RECOPY}.` });
  } else if (key.projectId !== value("BIGQUERY_JOB_PROJECT_ID")) {
    problems.push({
      variable: "SM_APP_KEY",
      message: `SM_APP_KEY belongs to a different project than BIGQUERY_JOB_PROJECT_ID; ${RECOPY} as one block.`,
    });
  }

  if (problems.length > 0 || typeof key === "string") return null;
  return {
    applicationId: value("SM_APPLICATION_ID"),
    key,
    jobProjectId: value("BIGQUERY_JOB_PROJECT_ID"),
    location: value("BIGQUERY_LOCATION"),
    dataProjectId: value("SM_DATA_PROJECT_ID"),
    transformedDatasetId: value("SM_TRANSFORMED_DATASET_ID"),
    metadataDatasetId: value("SM_METADATA_DATASET_ID"),
    maxBytesBilled,
  };
}

/** Returns the parsed key, or the reason it is unusable (never key material). */
function parseServiceAccountKey(encoded: string): ServiceAccountKey | string {
  if (encoded.length > MAX_KEY_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    return "is not base64 text";
  }
  let json: unknown;
  try {
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return "does not decode to a JSON service-account key";
  }
  if (typeof json !== "object" || json === null) return "does not decode to a JSON service-account key";
  const fields = json as Record<string, unknown>;
  const email = typeof fields.client_email === "string" ? fields.client_email : "";
  const emailMatch = SERVICE_ACCOUNT_EMAIL.exec(email);
  if (fields.type !== "service_account") return "is not a service-account key";
  if (!emailMatch) return "has no valid service-account email";
  if (typeof fields.project_id !== "string" || fields.project_id !== emailMatch[1]) {
    return "has a project that does not match its service-account email";
  }
  if (typeof fields.private_key_id !== "string" || !PRIVATE_KEY_ID.test(fields.private_key_id)) {
    return "has no valid key id";
  }
  const pem = typeof fields.private_key === "string" ? fields.private_key : "";
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----") || !pem.trimEnd().endsWith("-----END PRIVATE KEY-----")) {
    return "has no PKCS#8 private key";
  }
  return {
    clientEmail: email,
    privateKeyId: fields.private_key_id,
    privateKeyPem: pem,
    projectId: fields.project_id,
  };
}

/** The current request's configuration. Call per request; never cache at module scope. */
export function readConfig(): AppConfig {
  return parseConfig(process.env);
}

/** Build identifier inlined by next.config.ts; not a secret. */
export function buildId(): string {
  return process.env.SM_BUILD_ID ?? "dev";
}

/** One line naming the mode and guard, for the doctor and the top bar. Never a value. */
export function describeConfig(config: AppConfig): string {
  if (config.status === "error") return "Configuration error";
  const data = config.mode === "live" ? "Live data" : "Sample data";
  const guard = !config.guard
    ? "public"
    : config.guard.kind === "basic"
      ? "protected by shared password"
      : "protected by Cloudflare Access";
  return `${data}, ${guard}${config.storeId !== null ? ", restricted to one store" : ""}`;
}
