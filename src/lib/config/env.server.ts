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
 *   connection or seven live values, one valid guard -> live, protected
 *   some live values, or a bad value   -> error (no query, no sample fallback)
 *   all seven live,  no guard          -> error, including on localhost
 *   partial Access pair, bad Basic, or both guards -> error
 *   SM_HOSTING=managed-dev with the data API address -> managed development,
 *     loopback only, no Google key, guard or store restriction (docs/managed.md)
 *   SM_HOSTING=managed with the platform's app and deployment ids -> hosted by
 *     SourceMedium: the gateway's viewer, the data API through the outbound
 *     Worker, no developer token (set only by SourceMedium's deploy)
 *   SM_HOSTING with any self-hosted value, or another value -> error
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

/** Apps SourceMedium manages (docs/managed.md): the data API, not a Google key. */
export const MANAGED_VARIABLES = [
  "SM_HOSTING",
  "SM_DATA_API_URL",
  "SM_DEVELOPER_TOKEN",
  "SM_APP_ID",
  "SM_DEPLOYMENT_ID",
  "SM_GATEWAY_AUTH",
] as const;

/** Self-hosted settings a managed app never takes: no key, viewer guard, store restriction or byte cap. */
const SELF_HOSTED_VARIABLES = [
  "SM_CONNECTION",
  ...LIVE_VARIABLES,
  "APP_BASIC_AUTH",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
  "APP_STORE_ID",
  "BIGQUERY_MAX_BYTES_BILLED",
] as const;

const DATA_API_PATH = "/api/app-data/v1";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const DEVELOPER_TOKEN = /^smapp_[A-Za-z0-9_-]{43}$/;
/** A cloud environment may hold a placeholder its proxy swaps; printable, no spaces. */
const TOKEN_PLACEHOLDER = /^[\x21-\x7e]{1,512}$/;

const DEFAULT_MAX_BYTES_BILLED = 1024n * 1024n * 1024n; // 1 GiB

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

export type ManagedApiConfig = {
  /** The data API root, ending in /api/app-data/v1. */
  dataApiUrl: string;
  /**
   * Null when the environment's proxy adds the Authorization header, and
   * always in hosting, where the outbound Worker carries the viewer instead.
   */
  developerToken: string | null;
};

/** What SourceMedium's deploy names this deployment; identity, never authority. */
export type HostedConfig = { appId: string; deploymentId: string; authMethod: "workspace" | "probe" };

export type GuardConfig =
  { kind: "basic"; username: string; password: string } | { kind: "access"; teamDomain: string; audience: string };

/** One problem per variable, as one sentence naming the fix. Never a value. */
export type ConfigProblem = { variable: string; message: string };

export type AppConfig =
  | { status: "ok"; mode: "sample"; guard: GuardConfig | null; storeId: string | null }
  | { status: "ok"; mode: "live"; guard: GuardConfig; live: LiveConfig; storeId: string | null }
  | { status: "ok"; mode: "managed-dev"; guard: null; managed: ManagedApiConfig; storeId: null }
  | { status: "ok"; mode: "managed"; guard: null; managed: ManagedApiConfig; hosted: HostedConfig; storeId: null }
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
const MAX_CONNECTION_LENGTH = 32_768;

const RECOPY = "check the issued configuration block with your SourceMedium admin (docs/connect.md)";

/** Whitespace-only counts as missing. */
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function parseConfig(env: Env): AppConfig {
  const hosting = read(env, "SM_HOSTING");
  if (hosting !== undefined) return parseManaged(env, hosting);
  const problems: ConfigProblem[] = [];
  for (const name of ["SM_DATA_API_URL", "SM_DEVELOPER_TOKEN"] as const) {
    if (read(env, name) !== undefined) {
      problems.push({
        variable: name,
        message: `${name} is for development against SourceMedium's data API; set SM_HOSTING=managed-dev, or remove it for a self-hosted app (docs/managed.md).`,
      });
    }
  }
  if (problems.length > 0) return { status: "error", problems };
  const dataEnv = readLiveValues(env, problems);
  if (!dataEnv) return { status: "error", problems };
  const guard = parseGuard(env, problems);
  const guardProblems = problems.length;
  const present = LIVE_VARIABLES.filter((name) => read(dataEnv, name) !== undefined);
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

  const liveProblems: ConfigProblem[] = [];
  const live = parseLive(dataEnv, maxBytesBilled, liveProblems);
  if (read(env, "SM_CONNECTION") && liveProblems.length > 0) {
    problems.push(connectionProblem());
  } else {
    problems.push(...liveProblems);
  }
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

/**
 * Apps SourceMedium manages: development with a developer token, or hosting,
 * where the deploy sets the app and deployment ids and the gateway's outbound
 * Worker carries the viewer. Neither falls back to sample data, and both
 * refuse every self-hosted setting rather than guessing which was meant.
 */
function parseManaged(env: Env, hosting: string): AppConfig {
  const problems: ConfigProblem[] = [];
  const hosted = hosting === "managed";
  if (!hosted && hosting !== "managed-dev") {
    problems.push({
      variable: "SM_HOSTING",
      message:
        "SM_HOSTING must be managed-dev to develop against SourceMedium's data API, or removed for a self-hosted app (docs/managed.md).",
    });
  }
  for (const name of SELF_HOSTED_VARIABLES) {
    if (read(env, name) !== undefined) {
      problems.push({
        variable: name,
        message: `${name} belongs to a self-hosted app. Remove it and use only SourceMedium's managed settings (docs/managed.md).`,
      });
    }
  }
  const requireLive = read(env, "APP_REQUIRE_LIVE");
  if (requireLive !== undefined && requireLive !== "true" && requireLive !== "false") {
    problems.push({ variable: "APP_REQUIRE_LIVE", message: "APP_REQUIRE_LIVE must be true or false." });
  }
  const dataApiUrl = parseDataApiUrl(read(env, "SM_DATA_API_URL"), problems, hosted);
  const token = read(env, "SM_DEVELOPER_TOKEN");
  if (hosted) return parseHosted(env, dataApiUrl, token, problems);
  if (token !== undefined && !(token.startsWith("smapp_") ? DEVELOPER_TOKEN : TOKEN_PLACEHOLDER).test(token)) {
    problems.push({
      variable: "SM_DEVELOPER_TOKEN",
      message:
        "SM_DEVELOPER_TOKEN is incomplete; paste the whole token shown when it was created, or create a new one in your app's Agent setup (docs/managed.md#token-expired).",
    });
  }
  if (problems.length > 0 || dataApiUrl === null) return { status: "error", problems };
  return {
    status: "ok",
    mode: "managed-dev",
    guard: null,
    managed: { dataApiUrl, developerToken: token ?? null },
    storeId: null,
  };
}

/**
 * Hosting: the data API is reached only through the outbound Worker, which
 * attaches the viewer the gateway authorized. A developer token here would be
 * a credential in customer code, so it is refused, not ignored.
 */
function parseHosted(
  env: Env,
  dataApiUrl: string | null,
  token: string | undefined,
  problems: ConfigProblem[],
): AppConfig {
  if (token !== undefined) {
    problems.push({
      variable: "SM_DEVELOPER_TOKEN",
      message:
        "A hosted app never holds a developer token: SourceMedium's gateway carries each viewer's access. Remove it.",
    });
  }
  const ids = { appId: read(env, "SM_APP_ID"), deploymentId: read(env, "SM_DEPLOYMENT_ID") };
  // Display metadata only. Authorization still requires the gateway's viewer
  // and the data API's independent membership and deployment checks.
  const authMethod = read(env, "SM_GATEWAY_AUTH") ?? "workspace";
  if (authMethod !== "workspace" && authMethod !== "probe") {
    problems.push({
      variable: "SM_GATEWAY_AUTH",
      message: "SM_GATEWAY_AUTH must be workspace or probe, as set by SourceMedium's deploy.",
    });
  }
  for (const [variable, value] of [
    ["SM_APP_ID", ids.appId],
    ["SM_DEPLOYMENT_ID", ids.deploymentId],
  ] as const) {
    if (value === undefined || !UUID.test(value)) {
      problems.push({
        variable,
        message: `${variable} is set by SourceMedium's deploy; SM_HOSTING=managed is not for local use. To develop against your app's data, use SM_HOSTING=managed-dev (docs/managed.md).`,
      });
    }
  }
  if (problems.length > 0 || dataApiUrl === null || !ids.appId || !ids.deploymentId) {
    return { status: "error", problems };
  }
  return {
    status: "ok",
    mode: "managed",
    guard: null,
    managed: { dataApiUrl, developerToken: null },
    hosted: {
      appId: ids.appId,
      deploymentId: ids.deploymentId,
      authMethod: authMethod === "probe" ? "probe" : "workspace",
    },
    storeId: null,
  };
}

/** HTTPS (or, in development, http to this computer); exactly the data API root. */
function parseDataApiUrl(raw: string | undefined, problems: ConfigProblem[], hosted = false): string | null {
  const problem = (message: string) => {
    problems.push({ variable: "SM_DATA_API_URL", message });
    return null;
  };
  if (raw === undefined) {
    return problem(
      "SM_DATA_API_URL is missing; copy it from your app's Agent setup in SourceMedium (docs/managed.md).",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return problem("SM_DATA_API_URL is not a URL; copy it from your app's Agent setup in SourceMedium.");
  }
  if (url.protocol !== "https:" && (hosted || !(url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname)))) {
    return problem("SM_DATA_API_URL must use https://.");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "") !== DATA_API_PATH) {
    return problem(`SM_DATA_API_URL must be the data API address ending in ${DATA_API_PATH}, with nothing after it.`);
  }
  return `${url.origin}${DATA_API_PATH}`;
}

function connectionProblem(): ConfigProblem {
  return {
    variable: "SM_CONNECTION",
    message: `SM_CONNECTION is incomplete, invalid, or uses an unsupported format; ${RECOPY}.`,
  };
}

/** v1 bundles contain only data settings. Viewer guards and store scope stay independent. */
function readLiveValues(env: Env, problems: ConfigProblem[]): Env | null {
  const encoded = read(env, "SM_CONNECTION");
  if (encoded === undefined) return env;
  if (LIVE_VARIABLES.some((name) => read(env, name) !== undefined)) {
    problems.push({
      variable: "SM_CONNECTION",
      message:
        "Use SM_CONNECTION or the seven separate data settings, not both. Remove the old data settings when switching to SM_CONNECTION; keep your viewer guard and store restriction.",
    });
    return null;
  }
  try {
    if (encoded.length > MAX_CONNECTION_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error();
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const bundle: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !bundle ||
      typeof bundle !== "object" ||
      !("version" in bundle) ||
      bundle.version !== 1 ||
      !("values" in bundle)
    )
      throw new Error();
    const values = bundle.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error();
    const fields = values as Record<string, unknown>;
    if (
      Object.keys(fields).length !== LIVE_VARIABLES.length ||
      LIVE_VARIABLES.some((name) => typeof fields[name] !== "string" || !fields[name].trim())
    )
      throw new Error();
    return Object.fromEntries(LIVE_VARIABLES.map((name) => [name, fields[name] as string]));
  } catch {
    problems.push(connectionProblem());
    return null;
  }
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
  if (config.mode === "managed-dev")
    return "Live data through SourceMedium's data API, development on this computer only";
  if (config.mode === "managed")
    return config.hosted.authMethod === "probe"
      ? "Live data, hosted by SourceMedium with shared staging probe access"
      : "Live data, hosted by SourceMedium for signed-in workspace members";
  const data = config.mode === "live" ? "Live data" : "Sample data";
  const guard = !config.guard
    ? "public"
    : config.guard.kind === "basic"
      ? "protected by shared password"
      : "protected by Cloudflare Access";
  return `${data}, ${guard}${config.storeId !== null ? ", restricted to one store" : ""}`;
}

/** Safe instance metadata. These values never include a credential or warehouse coordinate. */
export function instanceInfo() {
  return {
    environment:
      process.env.APP_ENVIRONMENT === "production"
        ? "Production"
        : process.env.APP_ENVIRONMENT === "staging"
          ? "Staging"
          : process.env.APP_ENVIRONMENT === "preview"
            ? "Branch preview"
            : "Local / unassigned",
    requireLive: process.env.APP_REQUIRE_LIVE === "true",
    build: buildId(),
  };
}
