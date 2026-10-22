import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport, csvResponse } from "@/lib/csv.server";
import { parseChoice, summarySalesChannel, single } from "@/lib/filters";
import { parseTimeGrain, periodRange } from "@/lib/time-grain";
import { getBusiness, getPlatforms } from "./queries";
import { BUSINESS_FIELDS, PLATFORM_FIELDS } from "./rows";

/** Exact source measures and full-selection totals, scoped identically to the report. */
export async function GET(request: Request): Promise<Response> {
  await requireViewer();
  return csvExport(
    request,
    async ({ params, storeId, range, mode, currency }) => {
      const grain = parseTimeGrain(params);
      const channel = summarySalesChannel(params);
      const view = parseChoice(params, "view", ["business", "platforms"], "business");
      const filters = { storeId, range, grain, channel };
      const platform = single(params, "platform")?.slice(0, 200) ?? "";
      const rows =
        view === "business"
          ? await getBusiness(filters)
          : (await getPlatforms(filters)).filter((row) =>
              platform ? !row.combined && row.platform === platform : row.combined,
            );
      const fields = Object.keys(view === "business" ? BUSINESS_FIELDS : PLATFORM_FIELDS);
      return csvResponse(
        `${mode}-performance-${view}-${grain}-${range.from}-${range.to}.csv`,
        [
          { header: "data_mode", value: () => mode },
          { header: "report", value: () => view },
          { header: "store_id", value: () => storeId },
          { header: "from", value: () => range.from },
          { header: "to", value: () => range.to },
          { header: "reporting_currency", value: () => currency },
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
