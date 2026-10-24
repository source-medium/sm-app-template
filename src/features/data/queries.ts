import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { queryDefinitions } from "./bigquery";
import { sampleDefinitions } from "./sample";
import { DATA_SOURCES } from "./rows";
export async function getDefinitions(storeId: string) {
  const access = await requireViewer({ storeId });
  return access.mode === "sample" ? sampleDefinitions() : queryDefinitions(storeId, DATA_SOURCES);
}
