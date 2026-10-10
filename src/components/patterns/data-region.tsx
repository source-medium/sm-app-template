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
import { EmptyState, ErrorState, IncompatibleState } from "./data-states";

export async function DataRegion<T>({
  load,
  isEmpty,
  emptyMessage,
  timestamp,
  children,
}: {
  load: () => Promise<T>;
  isEmpty: (data: T) => boolean;
  emptyMessage: string;
  /**
   * The store's time zone (ReportContext.timeZone) to show the load time in,
   * or false for a region that loads filter options, not the report.
   */
  timestamp: string | false;
  children: (data: T) => React.ReactNode;
}) {
  const access = await requireViewer();
  let data: T;
  try {
    data = await load();
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    if (error.kind === "incompatible_schema" && error.relation && error.column) {
      return <IncompatibleState relation={error.relation} column={error.column} />;
    }
    return <ErrorState title={error.title} remedy={error.remedy} detail={error.detail} />;
  }
  // Stamp only successful loads, including empty results, after every query and decoder finishes.
  const completedAt = new Date().toISOString();
  return (
    <div className="flex flex-col gap-3">
      {isEmpty(data) ? <EmptyState message={emptyMessage} /> : children(data)}
      {timestamp !== false && (
        <p className="text-xs text-muted-foreground">
          {access.mode === "live" ? "Queried at " : "Sample loaded at "}
          <time dateTime={completedAt} data-slot="data-loaded-at">
            {formatInstant(completedAt, timestamp, true)}
          </time>
        </p>
      )}
    </div>
  );
}
