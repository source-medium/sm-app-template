/**
 * Loads one region's data on the server and renders the matching state.
 * Wrap it in <Suspense fallback={<LoadingState .../>}> for the loading state.
 *
 * Expected warehouse failures render their remedy here, on the server, so
 * the copy is never redacted. Anything else (a bug, a denied viewer, bad
 * configuration) is rethrown to the route's error boundary.
 */
import { WarehouseError } from "@/lib/data/warehouse-error";
import { requireViewer } from "@/lib/auth/require-viewer";
import { formatInstant } from "@/lib/format";
import { EmptyState, WarehouseErrorState } from "./data-states";

export async function DataRegion<T>({
  load,
  isEmpty,
  emptyMessage,
  emptyAction,
  timestamp,
  errorContent,
  children,
}: {
  load: () => Promise<T>;
  isEmpty: (data: T) => boolean;
  emptyMessage: string;
  /** A link that widens or clears the filter behind an empty result. */
  emptyAction?: { href: string; label: string };
  /**
   * The store's time zone (ReportContext.timeZone) to show the load time in,
   * or false for a region that loads filter options, not the report.
   */
  timestamp: string | false;
  /** Keep applied form controls available when their options query fails. The error still renders. */
  errorContent?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  const access = await requireViewer();
  let data: T;
  try {
    data = await load();
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return (
      <>
        <WarehouseErrorState error={error} />
        {errorContent}
      </>
    );
  }
  // Stamp only successful loads, including empty results, after every query and decoder finishes.
  const completedAt = new Date().toISOString();
  // Results the query cache served this request so far: the region says how old the oldest may be.
  const cached = access.mode === "live" ? access.request.provenance : null;
  return (
    <div className="flex flex-col gap-3">
      {isEmpty(data) ? <EmptyState message={emptyMessage} action={emptyAction} /> : children(data)}
      {timestamp !== false && (
        <p className="text-xs text-muted-foreground">
          {access.mode === "live" ? "Loaded at " : "Sample loaded at "}
          <time dateTime={completedAt} data-slot="data-loaded-at">
            {formatInstant(completedAt, timestamp, true)}
          </time>
          {cached?.oldestQueriedAt && (
            <span data-slot="data-cached-from">
              {"; includes cached results queried at "}
              <time dateTime={cached.oldestQueriedAt}>{formatInstant(cached.oldestQueriedAt, timestamp, true)}</time>
            </span>
          )}
        </p>
      )}
    </div>
  );
}
