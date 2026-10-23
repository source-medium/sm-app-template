/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * Managed development serves only this computer. The developer token
 * authorizes the development process, not a public app. The boundary is the
 * bind address (`pnpm dev` listens on 127.0.0.1, and scripts/managed-node.mjs
 * refuses any other). This check is a second layer: it refuses a request
 * addressed to another name, such as a DNS-rebinding page or a tunnel that
 * forwards the public Host, but a client or tunnel that writes a loopback
 * Host itself passes it, so it never replaces the bind address.
 */
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i;

export function isLoopbackRequest(headers: Headers): boolean {
  const host = headers.get("host");
  if (!host || !LOOPBACK_HOST.test(host)) return false;
  const origin = headers.get("origin");
  if (origin === null) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_HOST.test(url.host);
  } catch {
    return false;
  }
}
