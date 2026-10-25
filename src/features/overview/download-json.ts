import type { MetricBinding } from "@/lib/metric-binding";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport, reportJsonResponse } from "@/lib/csv.server";
import { summarySalesChannel } from "@/lib/filters";
import { calendarDate } from "@/lib/format";
import { parseTimeGrain } from "@/lib/time-grain";
import { parseComparisonPlan, planRanges } from "@/lib/comparison";
import { getOverviewReport } from "./queries";
import { overviewBindings } from "./metrics";
/** The response's results and provenance are built from this request's one report load. */
export async function GET(request: Request): Promise<Response> {
  const access = await requireViewer();
  return csvExport(
    request,
    async ({ params, storeId, range, mode, currency, timeZone }) => {
      const filters = { storeId, range, channel: summarySalesChannel(params), grain: parseTimeGrain(params) };
      const plan = parseComparisonPlan(params, range, calendarDate(new Date(), timeZone));
      const startedAt = new Date().toISOString();
      const report = await getOverviewReport(filters, planRanges(plan));
      const queriedAt = new Date().toISOString();
      return reportJsonResponse(
        `${mode}-overview-${range.from}-${range.to}.json`,
        {
          current: report.current,
          comparison: report.baselines[0]?.data ?? null,
          secondComparison: report.baselines[1]?.data ?? null,
        },
        {
          report: "overview",
          mode,
          filters,
          comparison: { mode: plan.slots[0].mode, range: plan.slots[0].range },
          comparisons: plan.slots.map((slot) => ({
            mode: slot.mode,
            range: slot.range,
            alignment: slot.alignment,
            label: slot.label,
            note: slot.note,
          })),
          rangeIntent: plan.intent,
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
          query: {
            startedAt,
            queriedAt,
            // Set when the query cache served any result in this request: the oldest one's origin time.
            cachedResultsQueriedAt: access.request.provenance.oldestQueriedAt,
            immutableSnapshot: false,
          },
          evidence: {
            pipelineFreshness: "unknown",
            completeness: "unknown",
            quality: "unknown",
            numericalReconciliation: "not established by this request",
          },
          limitations: [
            "No complete-through watermark is available.",
            "Comparison coverage gates remain applicable.",
            ...report.baselines.flatMap((baseline, index) =>
              baseline?.error ? [`Comparison ${index + 1} unavailable: ${baseline.error.title}`] : [],
            ),
          ],
        },
      );
    },
    { maxDays: appConfig.summaryMaxDays },
  );
}
