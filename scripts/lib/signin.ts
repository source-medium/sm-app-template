/**
 * `pnpm signin`: sign in to SourceMedium from this computer to develop
 * against your hosted app's real data (docs/managed.md#local-development).
 *
 * The browser does the signing in. This program listens on 127.0.0.1, opens
 * SourceMedium's Allow page, receives a one-time code there and exchanges it
 * with a PKCE verifier only it knows, for a developer token. The token goes
 * into .env.local; nothing else leaves this computer.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const DEFAULT_SOURCEMEDIUM_URL = "https://urchin.sourcemedium.com";
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

export type SignInResult = {
  token: string;
  expiresAt: string;
  dataApiUrl: string;
  app: { name: string };
  workspace: { name: string };
};

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** SourceMedium's address: https, or a loopback address for testing. */
export function sourceMediumOrigin(value: string | undefined): string {
  const url = new URL(value?.trim() || DEFAULT_SOURCEMEDIUM_URL);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
    throw new Error(`SOURCEMEDIUM_URL must use https:// (got ${url.origin}).`);
  return url.origin;
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>` +
  `<body style="font:16px system-ui;max-width:28rem;margin:20vh auto;padding:0 1rem"><h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body>`;

export async function signIn(deps: {
  origin: string;
  client: string;
  openBrowser(url: string): void | Promise<void>;
  log(line: string): void;
  fetch: typeof fetch;
  timeoutMs?: number;
}): Promise<SignInResult> {
  const { verifier, challenge } = pkcePair();
  const state = randomBytes(24).toString("base64url");
  let settle!: { resolve(code: string): void; reject(error: Error): void };
  const received = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // The reply can fail before anything awaits it; it is awaited below.
  received.catch(() => undefined);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      response.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    if (url.searchParams.get("state") !== state || !code) {
      response
        .writeHead(400, { "content-type": "text/html; charset=utf-8" })
        .end(page("This sign-in doesn't match", "Run <code>pnpm signin</code> again from your app's folder."));
      settle.reject(new Error("The sign-in reply did not match this sign-in. Run pnpm signin again."));
      return;
    }
    response
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(page("Signed in", "You can close this tab and go back to your terminal."));
    settle.resolve(code);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const timer = setTimeout(
    () => settle.reject(new Error("Sign-in timed out after 5 minutes. Run pnpm signin again.")),
    deps.timeoutMs ?? SIGN_IN_TIMEOUT_MS,
  );
  try {
    const allow = new URL("/apps/dev-login", deps.origin);
    allow.search = new URLSearchParams({
      port: String((server.address() as AddressInfo).port),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      client: deps.client,
    }).toString();
    deps.log(
      `Opening SourceMedium in your browser to allow this computer.\nIf it doesn't open, visit:\n  ${allow.href}`,
    );
    await deps.openBrowser(allow.href);
    const code = await received;
    const reply = await deps.fetch(new URL("/api/app-dev/v1/token", deps.origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });
    const body = (await reply.json().catch(() => null)) as (SignInResult & { error?: { message?: string } }) | null;
    if (!reply.ok || !body?.token)
      throw new Error(body?.error?.message ?? `SourceMedium refused the sign-in (HTTP ${reply.status}).`);
    return body;
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

/**
 * The .env.local text with SourceMedium's development values set. Other
 * settings stay; a self-hosted one would make managed development refuse to
 * start, so it is commented out with a note rather than deleted.
 */
export function withManagedDevValues(
  text: string,
  values: Record<string, string>,
  selfHosted: readonly string[],
): string {
  const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (!key) return line;
    if (Object.hasOwn(values, key)) {
      seen.add(key);
      return `${key}=${values[key]}`;
    }
    if (selfHosted.includes(key)) return `# Turned off by pnpm signin (self-hosted setting): ${line}`;
    return line;
  });
  const missing = Object.keys(values).filter((key) => !seen.has(key));
  if (missing.length > 0) {
    if (out.length > 0 && out.at(-1) !== "") out.push("");
    out.push("# SourceMedium local development (pnpm signin)");
    for (const key of missing) out.push(`${key}=${values[key]}`);
  }
  return `${out.join("\n")}\n`;
}
