export const SAVED_REPORTS_KEY = "sm-saved-report-views-v1";
export type SavedReport = { id: string; name: string; href: string };

/** Storage is untrusted. Keep valid entries independently and allow only local report routes still in navigation. */
export function parseSavedReports(raw: string | null, paths: readonly string[]): SavedReport[] {
  try {
    const entries: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(entries)) return [];
    const ids = new Set<string>();
    return entries.flatMap((entry: unknown): SavedReport[] => {
      if (!entry || typeof entry !== "object") return [];
      const { id, name, href } = entry as Record<string, unknown>;
      if (
        typeof id !== "string" ||
        !id ||
        ids.has(id) ||
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 80 ||
        typeof href !== "string" ||
        !href.startsWith("/") ||
        href.startsWith("//")
      )
        return [];
      try {
        const url = new URL(href, "https://saved.invalid");
        if (url.origin !== "https://saved.invalid" || !paths.includes(url.pathname)) return [];
        ids.add(id);
        return [{ id, name: name.trim(), href: `${url.pathname}${url.search}` }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
