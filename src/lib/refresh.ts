"use server";

/**
 * The Refresh button's server action. `refresh()` makes this action's response
 * re-render the current page within the same request, and that request's
 * context is marked to bypass the query cache, so the one render reads the
 * warehouse and replaces the cached entries it passes. No cookie, URL change or
 * second request is involved.
 */
import { refresh } from "next/cache";
import { isPublicDemoVisitor } from "@/lib/auth/authenticate";
import { requireViewer } from "@/lib/auth/require-viewer";

export async function requestRefresh(): Promise<void> {
  const access = await requireViewer();
  // A public demo visitor reads what everyone reads and never rewrites the shared cache.
  if (isPublicDemoVisitor(access.viewer)) return;
  access.request.bypassCache = true;
  refresh();
}
