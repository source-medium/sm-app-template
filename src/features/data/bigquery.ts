import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { loadReportMetadata } from "@/lib/data/report-metadata.server";
export async function queryDefinitions(storeId: string, sources: readonly string[]) {
  await requireViewer({ live: true, storeId });
  return loadReportMetadata(storeId, sources);
}
