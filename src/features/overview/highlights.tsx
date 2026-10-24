import "server-only";
import { DataTable } from "@/components/patterns/data-table";
import type { Comparison } from "@/lib/comparison";
import { revenueContributions } from "./contributions";
import { largestRevenueChanges } from "./revenue-changes";
import { toUnits } from "@/lib/data/decimal";
import { formatDate, formatMoney } from "@/lib/format";
import type { OverviewFilters, OverviewReport } from "./queries";
import { SectionHeader } from "@/components/patterns/section-header";

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
  const contributions = revenueContributions(report, filters, comparison);
  if (!changes.length && !contributions) return null;
  return (
    <section aria-labelledby="changes-heading">
      <SectionHeader id="changes-heading" title="Biggest changes" description="Largest daily revenue changes" />
      <div className="flex min-w-0 flex-col gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Up to three dates with the largest absolute net-revenue changes against their matched comparison dates.
          Missing values are excluded. These show where the period moved, not what caused it.
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
        {contributions && (
          <>
            <h3 className="font-medium">Sales channel and sub-channel contributions</h3>
            <p className="max-w-prose text-sm text-muted-foreground">
              The same published summary source, store, dates and sales channels as the totals above. Unclassified
              groups remain visible. An absent group has no recorded rows in that period; observed movements do not
              establish causes.
            </p>
            {contributions.limited ? (
              <>
                <p>
                  More than 200 groups were published. Named group changes are unavailable because the remainder may
                  contain different groups in each period. The period breakdowns include that remainder.
                </p>
                {contributions.periods?.map((period) => (
                  <DataTable
                    key={period.label}
                    caption={`${period.label} summary revenue groups`}
                    columns={[
                      { key: "group", header: "Sales channel / sub-channel" },
                      { key: "revenue", header: "Net revenue", align: "right" },
                    ]}
                    rows={period.groups.map((row, index) => ({
                      id: String(index),
                      cells: {
                        group: {
                          display: row.remainder
                            ? "Other groups (bounded remainder)"
                            : `${row.channel ?? "Unclassified sales channel"} / ${row.sub_channel ?? "Unclassified sub-channel"}`,
                        },
                        revenue: { display: formatMoney(row.revenue, currency) },
                      },
                    }))}
                  />
                ))}
              </>
            ) : (
              <DataTable
                caption="Summary revenue contributions"
                columns={[
                  { key: "group", header: "Sales channel / sub-channel" },
                  { key: "current", header: "Net revenue", align: "right" },
                  { key: "previous", header: "Comparison revenue", align: "right" },
                  { key: "change", header: "Revenue change", align: "right" },
                ]}
                rows={contributions.rows.map((row) => ({
                  id: row.id,
                  cells: {
                    group: { display: row.label },
                    current: { display: formatMoney(row.current, currency) },
                    previous: { display: formatMoney(row.previous, currency) },
                    change: { display: formatMoney(row.difference, currency) },
                  },
                }))}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
