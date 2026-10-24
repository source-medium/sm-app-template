import type { MetricBinding } from "@/lib/metric-binding";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport } from "@/lib/csv.server";
import { summarySalesChannel } from "@/lib/filters";
import { parseTimeGrain } from "@/lib/time-grain";
import { parseComparison } from "@/lib/comparison";
import { reportJsonResponse } from "@/lib/report-data";
import { getOverviewReport } from "./queries";
import { overviewBindings } from "./metrics";
/** The response's results and provenance are built from this request's one report load. */
export async function GET(request: Request): Promise<Response> {
  await requireViewer();
  return csvExport(
    request,
    async ({ params, storeId, range, mode, currency, timeZone }) => {
      const filters = { storeId, range, channel: summarySalesChannel(params), grain: parseTimeGrain(params) };
      const comparison = parseComparison(params, range);
      const startedAt = new Date().toISOString();
      const report = await getOverviewReport(filters, comparison.range);
      const queriedAt = new Date().toISOString();
      return reportJsonResponse(
        `${mode}-overview-${range.from}-${range.to}.json`,
        {
          current: report.current,
          comparison: report.comparison?.data ?? null,
        },
        {
          report: "overview",
          mode,
          filters,
          comparison,
          timeZone,
          reportingCurrency: { value: currency, verified: currency !== null, conversion: "none" },
          population: "Published Executive Summary rows in the applied sales-channel scope",
          attribution: "Summary reporting; MER is not platform-reported ROAS",
          metrics: overviewBindings.map(
            ({ id, canonical, calculation, source, fields, dateBasis, format }: MetricBinding) => ({
              id,
              canonicalMetric: canonical?.metric_name ?? null,
              identity: canonical ? "canonical binding" : "report-specific",
              calculation,
              source,
              fields,
              dateBasis,
              unit: format,
            }),
          ),
          query: { startedAt, queriedAt, immutableSnapshot: false },
          evidence: {
            pipelineFreshness: "unknown",
            completeness: "unknown",
            quality: "unknown",
            numericalReconciliation: "not established by this request",
          },
          limitations: [
            "No complete-through watermark is available.",
            "Comparison coverage gates remain applicable.",
            ...(report.comparison?.error ? [`Comparison unavailable: ${report.comparison.error.title}`] : []),
          ],
        },
      );
    },
    { maxDays: appConfig.summaryMaxDays },
  );
}
