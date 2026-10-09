import "server-only";
import { Download } from "lucide-react";
import { DataTable, type DataTableRow } from "@/components/patterns/data-table";
import { SelectFilter } from "@/components/patterns/select-filter";
import { buttonVariants } from "@/components/ui/button";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { toChartNumber } from "@/lib/data/decode";
import { withParams } from "@/lib/filters";
import { formatCount, formatDate, formatMeasure, formatMoney, formatMultiple } from "@/lib/format";
import { TIME_GRAINS } from "@/lib/time-grain";
import { overviewSummaryRows } from "./summary-rows";
import type { OverviewData, OverviewFilters, OverviewMeasures } from "./queries";

function cells(label: string, measures: OverviewMeasures): DataTableRow["cells"] {
  const revenue = decimalToNumber(measures.netRevenue);
  const spend = decimalToNumber(measures.adSpend);
  return {
    period: { display: label },
    revenue: { display: formatMoney(measures.netRevenue), sort: revenue },
    orders: { display: formatMeasure(measures.orders), sort: measures.orders },
    average: { display: formatMoney(ratio(revenue, measures.orders)), sort: ratio(revenue, measures.orders) },
    spend: { display: formatMoney(measures.adSpend), sort: spend },
    mer: { display: formatMultiple(ratio(revenue, spend)), sort: ratio(revenue, spend) },
    sessions: {
      display: formatCount(measures.sessions),
      sort: measures.sessions === null ? null : toChartNumber(measures.sessions),
    },
  };
}

export function OverviewSummary({ data, filters }: { data: OverviewData; filters: OverviewFilters }) {
  const records = overviewSummaryRows(data, filters);
  const rows = records
    .filter((row) => row.rowType === "period")
    .map((row) => ({
      id: row.from,
      cells: cells(row.from === row.to ? formatDate(row.from) : `${formatDate(row.from)} – ${formatDate(row.to)}`, row),
    }));
  return (
    <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="summary-heading" className="text-lg font-semibold">
            Business summary
          </h2>
          <p className="text-sm text-muted-foreground">
            Selected dates only. Weeks start Monday; edge weeks and months may be partial.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SelectFilter name="grain" label="Summary rows" value={filters.grain ?? "day"} options={[...TIME_GRAINS]} />
          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={withParams(
              "/overview/export",
              {},
              {
                store: filters.storeId,
                ...filters.range,
                grain: filters.grain ?? "day",
                sales_channel: filters.channel ?? null,
              },
            )}
          >
            <Download aria-hidden />
            Download CSV
          </a>
        </div>
      </div>
      <DataTable
        caption="Business summary"
        columns={[
          { key: "period", header: "Period", sortable: false },
          { key: "revenue", header: "Net revenue", align: "right" },
          { key: "orders", header: "Summary orders", align: "right" },
          { key: "average", header: "Revenue / summary order", align: "right" },
          { key: "spend", header: "Ad spend", align: "right" },
          { key: "mer", header: "MER", align: "right" },
          { key: "sessions", header: "Sessions", align: "right" },
        ]}
        rows={rows}
        totals={data.totals ? { id: "total", cells: cells("Selected period total", data.totals) } : undefined}
      />
    </section>
  );
}
