import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport, csvResponse } from "@/lib/csv.server";
import { parseSalesChannel } from "@/lib/filters";
import { getOverview } from "./queries";
import { parseTimeGrain } from "@/lib/time-grain";
import { overviewSummaryRows } from "./summary-rows";

/** Re-read the applied summary filters; export period rows and one explicitly marked full total. */
export async function GET(request: Request): Promise<Response> {
  await requireViewer();
  return csvExport(request, async ({ params, storeId, range, mode }) => {
    const filters = { storeId, range, channel: parseSalesChannel(params), grain: parseTimeGrain(params) };
    const data = await getOverview(filters);
    const rows = overviewSummaryRows(data, filters);
    return csvResponse(
      `${mode}-summary-${filters.grain}-${range.from}-${range.to}.csv`,
      [
        { header: "data_mode", value: () => mode },
        { header: "store_id", value: () => storeId },
        { header: "from", value: () => range.from },
        { header: "to", value: () => range.to },
        { header: "reporting_currency", value: () => appConfig.currency },
        { header: "sales_channel", value: () => filters.channel },
        { header: "grain", value: () => filters.grain },
        { header: "row_type", value: (row) => row.rowType },
        { header: "period_from", value: (row) => row.from },
        { header: "period_to", value: (row) => row.to },
        { header: "net_revenue", value: (row) => row.netRevenue, numeric: true },
        { header: "summary_orders", value: (row) => row.orders, numeric: true },
        { header: "ad_spend", value: (row) => row.adSpend, numeric: true },
        { header: "website_sessions", value: (row) => row.sessions, numeric: true },
      ],
      rows,
    );
  });
}
