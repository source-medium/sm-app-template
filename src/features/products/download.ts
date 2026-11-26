import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport, csvResponse, scopeColumns } from "@/lib/csv.server";
import { reportSalesChannel } from "@/lib/filters";
import { parseComparisonPlan, planRanges } from "@/lib/comparison";
import { calendarDate } from "@/lib/format";
import { getProducts, productOptions } from "./queries";
import { productNames } from "./names";

/** The report's ranked products with its filters and search, every row up to the explorer's bound. */
export async function GET(request: Request): Promise<Response> {
  await requireViewer();
  return csvExport(request, async (scope) => {
    const { params, storeId, range, mode, timeZone } = scope;
    const options = productOptions(params);
    const channel = reportSalesChannel(params);
    // The report's comparisons, so period gainers and decliners rank as they do on screen.
    const plan = parseComparisonPlan(params, range, calendarDate(new Date(), timeZone));
    const data = await getProducts({ storeId, range, ...options, channel }, planRanges(plan), { all: true });
    const name = productNames(data.rows);
    return csvResponse(
      `${mode}-products${data.truncated ? "-partial" : ""}-${range.from}-${range.to}.csv`,
      [
        ...scopeColumns(scope, "products"),
        { header: "export_truncated", value: () => data.truncated },
        { header: "sales_channel", value: () => channel },
        { header: "dimension", value: () => options.dimension },
        { header: "rank_by", value: () => options.metric },
        { header: "ranking", value: () => options.ranking },
        { header: "search", value: () => options.q },
        { header: "product_key", value: (row) => row.product_key },
        { header: "product", value: (row) => name(row) },
        { header: "reference", value: (row) => row.reference },
        { header: "net_revenue", value: (row) => row.revenue, numeric: true },
        { header: "net_units", value: (row) => row.units, numeric: true },
        { header: "product_gross_profit", value: (row) => row.profit, numeric: true },
        { header: "refund_amount", value: (row) => row.refunds, numeric: true },
        { header: "refunded_units", value: (row) => row.refunded_units, numeric: true },
        { header: "rank_by_total", value: (row) => row[`total_${options.metric}`], numeric: true },
        {
          header: "rank_by_comparison",
          value: (row) => row[`previous_${options.metric}`],
          numeric: true,
        },
      ],
      data.rows,
    );
  });
}
