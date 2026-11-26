import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportMetadata } from "@/lib/data/report-metadata.server";
import { queryPresetSources } from "./bigquery";

/** Sample data carries every preset's source. */
const SAMPLE: ReportMetadata = { mode: "sample", metrics: [], catalog: "unknown", sources: [], truncated: false };

export async function getPresetSources(storeId: string): Promise<ReportMetadata> {
  const access = await requireViewer({ storeId });
  return access.mode === "sample" ? SAMPLE : queryPresetSources(storeId);
}
