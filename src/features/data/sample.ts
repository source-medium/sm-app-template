import { REVIEWED_METRICS } from "@/lib/reviewed-metrics";
import type { ReportMetadata } from "@/lib/data/report-metadata.server";
export function sampleDefinitions(): ReportMetadata {
  return { mode: "sample", metrics: [...REVIEWED_METRICS], catalog: "accessible", sources: [], truncated: false };
}
