/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * Exchanges the app's service-account key for a short-lived Google access
 * token (RFC 7523 JWT bearer), signed with WebCrypto so it runs in Workers,
 * Node, and Vercel unchanged. This file is the credential seam: a future
 * workload identity replaces it without touching the query client.
 *
 * Google's fixed token endpoint is used, never a URL from inside the key.
 * Neither the key nor the token is ever logged.
 */
import "server-only";
import type { ServiceAccountKey } from "@/lib/config/env.server";
import { WarehouseError } from "./warehouse-error";

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/bigquery";
const TOKEN_LIFETIME_SECONDS = 3600;
/** Refresh this long before expiry so an in-flight query never holds a dying token. */
const REFRESH_MARGIN_SECONDS = 300;
/** Bounds the one shared token request; each caller's own deadline still applies. */
const EXCHANGE_TIMEOUT_MS = 10_000;

export type TokenProvider = (signal: AbortSignal) => Promise<string>;

type ProviderOptions = {
  fetch?: typeof fetch;
  now?: () => number;
};

/**
 * One provider per key. It caches the token until shortly before expiry and
 * shares a single in-flight exchange between concurrent callers.
 */
export function createTokenProvider(key: ServiceAccountKey, options: ProviderOptions = {}): TokenProvider {
  // Resolved per call: hosts may wrap the global fetch after this module loads.
  const fetchImpl: typeof fetch = (input, init) => (options.fetch ?? globalThis.fetch)(input, init);
  const now = options.now ?? Date.now;
  let cached: { token: string; expiresAtSeconds: number } | null = null;
  let inFlight: Promise<{ token: string; expiresAtSeconds: number }> | null = null;
  let signingKey: Promise<CryptoKey> | null = null;

  return async (signal) => {
    const nowSeconds = Math.floor(now() / 1000);
    if (cached && cached.expiresAtSeconds - REFRESH_MARGIN_SECONDS > nowSeconds) return cached.token;
    // The shared exchange has its own bound, so one caller's deadline never
    // cancels it for another; each caller stops waiting at its own deadline.
    inFlight ??= (signingKey ??= importPrivateKey(key.privateKeyPem))
      .then((signing) => exchange(key, signing, nowSeconds, fetchImpl, AbortSignal.timeout(EXCHANGE_TIMEOUT_MS)))
      .finally(() => {
        inFlight = null;
      });
    cached = await untilAborted(inFlight, signal);
    return cached.token;
  };
}

/** Waits for a shared promise, giving up (without cancelling it) when this caller's signal aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function exchange(
  key: ServiceAccountKey,
  signingKey: CryptoKey,
  nowSeconds: number,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ token: string; expiresAtSeconds: number }> {
  const header = { alg: "RS256", typ: "JWT", kid: key.privateKeyId };
  const claims = {
    iss: key.clientEmail,
    scope: SCOPE,
    aud: GOOGLE_TOKEN_ENDPOINT,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;

  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal,
    });
  } catch (error) {
    throw WarehouseError.fromTransport(error, "token");
  }

  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
    error?: unknown;
  } | null;

  if (!response.ok) {
    // invalid_grant covers a replaced, deleted, or disabled key or account.
    // Google does not say which, so the remedy names every possibility.
    if (body?.error === "invalid_grant" || response.status === 401) {
      throw new WarehouseError("credential_invalid", { status: response.status, reason: "invalid_grant" });
    }
    if (response.status === 429 || response.status >= 500) {
      throw new WarehouseError("transient", { status: response.status, reason: "token_endpoint" });
    }
    throw new WarehouseError("credential_invalid", {
      status: response.status,
      reason: String(body?.error ?? "token_error"),
    });
  }

  if (typeof body?.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new WarehouseError("response_invalid", { reason: "token_response" });
  }
  return { token: body.access_token, expiresAtSeconds: nowSeconds + body.expires_in };
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  try {
    return await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  } catch {
    throw new WarehouseError("credential_invalid", { reason: "private_key_unreadable" });
  }
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
