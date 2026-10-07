import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { StoreAccessError } from "@/lib/auth/store-access";
import { csvResponse } from "@/lib/csv.server";
import { loadStores } from "@/lib/data/stores.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { parseDateRange, single, type SearchParams } from "@/lib/filters";
import { getOverview, overviewChannel } from "./queries";
import { parseTimeGrain } from "@/lib/time-grain";
import { overviewSummaryRows } from "./summary-rows";

/** Re-read the applied summary filters; export period rows and one explicitly marked full total. */
export async function GET(request: Request): Promise<Response> {
  const access = await requireViewer();
  const params: SearchParams = {};
  for (const [key, value] of new URL(request.url).searchParams) if (params[key] === undefined) params[key] = value;
  const range = parseDateRange(params, new Date());
  try {
    const suppliedStore = single(params, "store");
    if (suppliedStore !== undefined) await requireViewer({ storeId: suppliedStore });
    const storeId = suppliedStore?.slice(0, 200) || access.storeId || (await loadStores())[0]?.id;
    if (!storeId)
      return Response.json(
        { title: "No store selected" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    const filters = { storeId, range, channel: overviewChannel(params), grain: parseTimeGrain(params) };
    const data = await getOverview(filters);
    const rows = overviewSummaryRows(data, filters);
    return csvResponse(
      `${access.mode}-summary-${filters.grain}-${range.from}-${range.to}.csv`,
      [
        { header: "data_mode", value: () => access.mode },
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
  } catch (error) {
    if (error instanceof StoreAccessError)
      return Response.json(
        { title: error.message },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    if (!(error instanceof WarehouseError)) throw error;
    return Response.json(
      { title: error.title, remedy: error.remedy },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
