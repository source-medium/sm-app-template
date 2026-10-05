/**
 * Headers on every response. A private app is private to crawlers too
 * (noindex). Remove noindex for a route only when you publish a public page
 * on purpose.
 *
 * Creative images are hotlinked from the ad platform's CDN. Only these hosts
 * may serve images; add a host here when a new platform's images should show.
 * Meta's CDN is listed provisionally until phase A records the observed set.
 */
export const IMAGE_HOSTS = ["https://*.fbcdn.net"];

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": `frame-ancestors 'none'; img-src 'self' data: ${IMAGE_HOSTS.join(" ")}`,
};
