/**
 * Loads one region's data on the server and renders the matching state.
 * Wrap it in <Suspense fallback={<LoadingState .../>}> for the loading state.
 *
 * Expected warehouse failures render their remedy here, on the server, so
 * the copy is never redacted. Anything else (a bug, a denied viewer, bad
 * configuration) is rethrown to the route's error boundary.
 */
import { WarehouseError } from "@/lib/data/warehouse-error";
import { EmptyState, ErrorState, IncompatibleState } from "./data-states";

export async function DataRegion<T>({
  load,
  isEmpty,
  emptyMessage,
  children,
}: {
  load: () => Promise<T>;
  isEmpty: (data: T) => boolean;
  emptyMessage: string;
  children: (data: T) => React.ReactNode;
}) {
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
  return isEmpty(data) ? <EmptyState message={emptyMessage} /> : <>{children(data)}</>;
}
