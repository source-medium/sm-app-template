/**
 * Headers on every response. A private app is private to crawlers too
 * (noindex). Remove noindex for a route only when you publish a public page
 * on purpose.
 *
 * Images: same-origin, data: URLs, and any https host, so ad creative images
 * load straight from the URLs in your warehouse whatever platform served
 * them. They load without a referrer, and an expired link shows the
 * creative's text instead. Narrow img-src to specific hosts if you prefer.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "frame-ancestors 'none'; img-src 'self' data: https:",
};
