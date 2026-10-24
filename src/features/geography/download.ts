import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport, csvResponse } from "@/lib/csv.server";
import { geographyOptions } from "./filters";
import { getGeography } from "./queries";
/** Independent full-population total and every returned location, including a bounded remainder. */
export async function GET(request: Request): Promise<Response> {
  await requireViewer();
  return csvExport(request, async ({ params, storeId, range, mode, currency }) => {
    const { issue, ...options } = geographyOptions(params);
    if (issue) return new Response(issue, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    const data = await getGeography({ storeId, range, ...options }, null);
    return csvResponse(
      `${mode}-geography-${range.from}-${range.to}.csv`,
      [
        { header: "data_mode", value: () => mode },
        { header: "report", value: () => "geography" },
        { header: "store_id", value: () => storeId },
        { header: "from", value: () => range.from },
        { header: "to", value: () => range.to },
        { header: "reporting_currency", value: () => currency },
        { header: "sales_channel", value: () => options.channel },
        { header: "grain", value: () => "day" },
        { header: "date_basis", value: () => options.dateBasis },
        { header: "population", value: () => "valid" },
        { header: "country", value: () => options.country },
        { header: "region", value: () => options.region },
        { header: "row_type", value: (row) => row.kind },
        { header: "location", value: (row) => row.location },
        { header: "net_revenue", value: (row) => row.revenue, numeric: true },
        { header: "valid_orders", value: (row) => row.orders, numeric: true },
      ],
      [data.total, ...data.groups],
    );
  });
}
