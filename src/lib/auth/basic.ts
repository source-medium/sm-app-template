/**
 * sm-app-template integration file. Template version: 1.0.0.
 *
 * HTTP Basic, the default viewer guard: one shared, generated password.
 * Limits (docs/auth.md): a shared identity, no per-person audit, no browser
 * logout, and no fit for writes without a real authorization and CSRF design.
 */

/** Bounds the work an unauthenticated request can cause. */
export const MAX_AUTHORIZATION_HEADER_LENGTH = 512;

const BASIC_HEADER = /^Basic ([A-Za-z0-9+/]+={0,2})$/;

export type BasicCredential = { username: string; password: string };

/**
 * True only for a well-formed `Basic` header carrying exactly the expected
 * credential. Compares fixed-length SHA-256 digests in constant time, so the
 * comparison leaks neither the password nor its length.
 */
export async function verifyBasicAuthorization(header: string | null, expected: BasicCredential): Promise<boolean> {
  if (!header || header.length > MAX_AUTHORIZATION_HEADER_LENGTH) return false;
  const match = BASIC_HEADER.exec(header);
  if (!match?.[1]) return false;

  let decoded: string;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  if (!decoded.includes(":")) return false;

  const [given, wanted] = await Promise.all([sha256(decoded), sha256(`${expected.username}:${expected.password}`)]);
  return constantTimeEqual(given, wanted);
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Both inputs are 32-byte digests; every byte is compared regardless of earlier differences. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/** The challenge carries no data: a fixed realm and a fixed sentence. */
export function basicChallengeHeaders(): Record<string, string> {
  return {
    "WWW-Authenticate": 'Basic realm="SourceMedium app", charset="UTF-8"',
    "Cache-Control": "private, no-store",
    "Content-Type": "text/plain; charset=utf-8",
  };
}
