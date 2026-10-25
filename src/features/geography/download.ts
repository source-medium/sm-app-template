import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport, csvResponse, exportError, scopeColumns } from "@/lib/csv.server";
import { geographyOptions } from "./filters";
import { getGeography } from "./queries";
/** Independent full-population total and every returned location, including a bounded remainder. */
export async function GET(request: Request): Promise<Response> {
  await requireViewer();
  return csvExport(request, async (scope) => {
    const { params, storeId, range, mode } = scope;
    const { issue, ...options } = geographyOptions(params);
    if (issue) return exportError(400, { title: "Check the filters", remedy: issue });
    const data = await getGeography({ storeId, range, ...options }, [null, null]);
    return csvResponse(
      `${mode}-geography-${range.from}-${range.to}.csv`,
      [
        ...scopeColumns(scope, "geography"),
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
