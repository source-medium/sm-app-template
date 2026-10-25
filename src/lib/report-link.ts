import { REPORT_FILTER_FORM_ID } from "./filters";

/** Applied server filters plus live, declared presentation choices. Unapplied filter drafts never leak into links. */
export function resolveReportLink(href: string, presentationParams: readonly string[]): URL {
  const resolved = new URL(href, window.location.origin);
  const current = new URL(window.location.href);
  const form = document.getElementById(REPORT_FILTER_FORM_ID);
  const applied = form instanceof HTMLFormElement ? new FormData(form) : null;
  for (const key of presentationParams) {
    resolved.searchParams.delete(key);
    const values = applied?.has(key) ? applied.getAll(key) : current.searchParams.getAll(key);
    for (const value of values) if (typeof value === "string") resolved.searchParams.append(key, value);
  }
  return resolved;
}
