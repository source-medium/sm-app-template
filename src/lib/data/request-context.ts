/**
 * What one request carries into the data layer: a correlation id for its log
 * lines, whether it must bypass the query cache, and which cached results it
 * has been served so far, so a page can say how old they are.
 *
 * requireViewer() creates one per request and hands it to the Warehouse. Only
 * the Refresh button's server action sets the bypass (src/lib/refresh.ts), for
 * the page render its own response carries.
 */

export type CacheProvenance = {
  /** Origin completion time of the oldest cached result served in this request, or null. */
  oldestQueriedAt: string | null;
  servedFromCache: number;
};

export type RequestContext = {
  /** A per-request id, logged as app_request_id on every query line. Never a session or viewer id. */
  id: string;
  /** This request is a Refresh: read nothing from the cache, store what the warehouse returns. */
  bypassCache: boolean;
  provenance: CacheProvenance;
};

export function newRequestContext(): RequestContext {
  return {
    id: crypto.randomUUID(),
    bypassCache: false,
    provenance: { oldestQueriedAt: null, servedFromCache: 0 },
  };
}

/** Records that a cached result was served, keeping the oldest origin time. */
export function recordCachedResult(context: RequestContext, queriedAt: string): void {
  context.provenance.servedFromCache += 1;
  if (context.provenance.oldestQueriedAt === null || queriedAt < context.provenance.oldestQueriedAt)
    context.provenance.oldestQueriedAt = queriedAt;
}
