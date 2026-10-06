/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * Cloudflare Access, the per-person viewer guard. Access authenticates people
 * at the edge; this file verifies the token Access attaches, so a request that
 * reaches the app without passing Access fails here too. It complements Access
 * coverage of every hostname; it does not replace it (docs/auth.md).
 */
// Subpath imports keep jose's encryption code (unused here) out of the edge middleware.
import { createRemoteJWKSet, customFetch } from "jose/jwks/remote";
import { jwtVerify, type JWTVerifyGetKey } from "jose/jwt/verify";

export const ACCESS_TOKEN_HEADER = "cf-access-jwt-assertion";
const MAX_TOKEN_LENGTH = 8192;

export type AccessSettings = { teamDomain: string; audience: string };

export type AccessResult =
  { ok: true; email: string } | { ok: false; reason: "missing" | "invalid" | "keys_unavailable" };

type VerifierOptions = {
  /** Replaces the network for tests; production uses the global fetch. */
  fetch?: typeof fetch;
  /** Fixed clock for tests. */
  currentDate?: Date;
  /** How soon an unknown key id may trigger a key-set refetch. Tests shorten it. */
  cooldownMs?: number;
};

export type AccessVerifier = (token: string | null) => Promise<AccessResult>;

/**
 * Builds a verifier for one Access application. The signing keys come only
 * from the validated team domain, are fetched with a bound, and are cached;
 * an unavailable key set fails closed.
 */
export function createAccessVerifier(settings: AccessSettings, options: VerifierOptions = {}): AccessVerifier {
  const issuer = `https://${settings.teamDomain}`;
  const keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
    timeoutDuration: 3000,
    cooldownDuration: options.cooldownMs ?? 30_000,
    cacheMaxAge: 10 * 60_000,
    ...(options.fetch ? { [customFetch]: options.fetch } : {}),
  });

  return async (token) => {
    if (!token) return { ok: false, reason: "missing" };
    if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid" };
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: settings.audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat"],
        ...(options.currentDate ? { currentDate: options.currentDate } : {}),
      });
      const email = typeof payload.email === "string" ? payload.email : "";
      return email ? { ok: true, email } : { ok: false, reason: "invalid" };
    } catch (error) {
      return { ok: false, reason: isKeyAvailabilityError(error) ? "keys_unavailable" : "invalid" };
    }
  };
}

function isKeyAvailabilityError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  // jose raises these when the key set cannot be fetched or parsed. A token
  // naming an unknown key is "invalid" after jose's own refetch.
  return (
    code === "ERR_JWKS_TIMEOUT" ||
    code === "ERR_JWKS_INVALID" ||
    code === "ERR_JOSE_GENERIC" ||
    error instanceof TypeError
  );
}

const verifiers = new Map<string, AccessVerifier>();

/** One cached verifier per Access application for the life of the isolate. */
export function accessVerifierFor(settings: AccessSettings): AccessVerifier {
  const cacheKey = `${settings.teamDomain}|${settings.audience}`;
  let verifier = verifiers.get(cacheKey);
  if (!verifier) {
    verifier = createAccessVerifier(settings);
    verifiers.set(cacheKey, verifier);
  }
  return verifier;
}
