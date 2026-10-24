import definitions from "../../../contracts/dashboard-metrics-v1/definitions.json";
import type { ReportMetadata } from "@/lib/data/report-metadata.server";
export function sampleDefinitions(): ReportMetadata {
  return { mode: "sample", metrics: definitions.metrics, catalog: "accessible", sources: [], truncated: false };
}
