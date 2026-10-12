import "server-only";
import { DataTable } from "@/components/patterns/data-table";
import type { Comparison } from "@/lib/comparison";
import { largestRevenueChanges } from "./revenue-changes";
import { toUnits } from "@/lib/data/decimal";
import { formatDate, formatMoney } from "@/lib/format";
import type { OverviewFilters, OverviewReport } from "./queries";

export function OverviewHighlights({
  report,
  filters,
  comparison,
  currency,
}: {
  report: OverviewReport;
  filters: OverviewFilters;
  comparison?: Comparison;
  currency: string | null;
}) {
  const changes = largestRevenueChanges(report, filters, comparison);
  if (!changes.length) return null;
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-medium">Largest daily revenue changes</summary>
      <p className="my-3 max-w-prose text-sm text-muted-foreground">
        Up to three dates with the largest absolute net-revenue changes against their matched comparison dates. Missing
        values are excluded. These show where the period moved, not what caused it.
      </p>
      <DataTable
        caption="Largest daily revenue changes"
        paginate={false}
        columns={[
          { key: "date", header: "Selected date", sortable: false },
          { key: "baseline", header: "Comparison date", sortable: false },
          { key: "current", header: "Net revenue", align: "right", sortable: false },
          { key: "previous", header: "Comparison revenue", align: "right", sortable: false },
          { key: "change", header: "Revenue change", align: "right", sortable: false },
        ]}
        rows={changes.map((row) => ({
          id: row.date,
          cells: {
            date: { display: formatDate(row.date) },
            baseline: { display: formatDate(row.baselineDate) },
            current: { display: formatMoney(row.current, currency) },
            previous: { display: formatMoney(row.previous, currency) },
            change: { display: `${toUnits(row.difference) > 0n ? "+" : ""}${formatMoney(row.difference, currency)}` },
          },
        }))}
      />
    </details>
  );
}
