import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport, csvResponse, scopeColumns } from "@/lib/csv.server";
import { parseChoice, summarySalesChannel } from "@/lib/filters";
import { parseTimeGrain, periodRange } from "@/lib/time-grain";
import { getBusiness, getPlatforms } from "./queries";
import { BUSINESS_FIELDS, parsePlatform, PLATFORM_FIELDS, scopePlatformRecords } from "./rows";

/** Exact source measures and full-selection totals, scoped identically to the report. */
export async function GET(request: Request): Promise<Response> {
  await requireViewer();
  return csvExport(
    request,
    async (scope) => {
      const { params, storeId, range, mode } = scope;
      const grain = parseTimeGrain(params);
      const channel = summarySalesChannel(params);
      const view = parseChoice(params, "view", ["business", "platforms"], "business");
      const filters = { storeId, range, grain, channel };
      const platform = parsePlatform(params);
      const rows =
        view === "business" ? await getBusiness(filters) : scopePlatformRecords(await getPlatforms(filters), platform);
      const fields = Object.keys(view === "business" ? BUSINESS_FIELDS : PLATFORM_FIELDS);
      return csvResponse(
        `${mode}-performance-${view}-${grain}-${range.from}-${range.to}.csv`,
        [
          ...scopeColumns(scope, view),
          { header: "sales_channels", value: () => channel },
          { header: "grain", value: () => grain },
          { header: "platform", value: () => (view === "platforms" ? platform || "combined" : null) },
          { header: "row_type", value: (row) => (row.is_total ? "total" : "period") },
          {
            header: "period_from",
            value: (row) => (row.period_date ? periodRange(row.period_date, grain, range).from : range.from),
          },
          {
            header: "period_to",
            value: (row) => (row.period_date ? periodRange(row.period_date, grain, range).to : range.to),
          },
          ...fields.map((field) => ({
            header: field,
            numeric: true,
            value: (row: (typeof rows)[number]) => {
              const value = row[field as keyof typeof row];
              return typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? value : null;
            },
          })),
        ],
        rows,
      );
    },
    { maxDays: appConfig.summaryMaxDays },
  );
}
