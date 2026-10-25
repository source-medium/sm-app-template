/** Browser-loaded images only: HTTPS without credentials, or a plain same-origin asset path. */
export function safeImageUrl(value: string | null): string | null {
  const source = value?.trim();
  if (!source) return null;
  if (/^\/(?!\/)[A-Za-z0-9/_.-]+$/.test(source)) return source;
  try {
    const url = new URL(source);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
