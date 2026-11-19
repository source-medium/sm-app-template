import "server-only";
import { DataTable, type DataTableCell } from "@/components/patterns/data-table";
import { changeTone, type Baseline, type Polarity } from "@/lib/comparison";
import { revenueContributions } from "./contributions";
import { largestRevenueChanges } from "./revenue-changes";
import { toUnits } from "@/lib/data/decimal";
import { channelName } from "@/lib/filters";
import { formatDate, formatMoney } from "@/lib/format";
import type { OverviewFilters, OverviewSlice } from "./queries";
import { SectionHeader } from "@/components/patterns/section-header";
import { Disclosure } from "@/components/ui/disclosure";

/** A signed revenue difference, colored by `better`; a reconciliation residual passes "neutral". */
function revenueChange(difference: string | null, currency: string | null, better: Polarity): DataTableCell {
  const units = difference === null ? null : toUnits(difference);
  return {
    display: `${units !== null && units > 0n ? "+" : ""}${formatMoney(difference, currency)}`,
    tone:
      units === null ? undefined : (changeTone(units > 0n ? "up" : units < 0n ? "down" : "flat", better) ?? undefined),
  };
}

export function OverviewHighlights({
  report,
  filters,
  comparison,
  currency,
}: {
  report: OverviewSlice;
  filters: OverviewFilters;
  comparison?: Baseline;
  currency: string | null;
}) {
  const changes = largestRevenueChanges(report, filters, comparison);
  // Named once for the section, so the change columns keep short headers that fit a phone.
  const versus = comparison?.range ? `vs ${comparison.short}` : null;
  const contributions = revenueContributions(report, filters, comparison);
  if (!changes.length && !contributions) return null;
  return (
    <section aria-labelledby="changes-heading">
      <SectionHeader
        id="changes-heading"
        title="Biggest changes"
        description={`Where the period moved, not what caused it.${versus ? ` Changes are ${versus}.` : ""}`}
      />
      <div className="mt-3 flex min-w-0 flex-col gap-3">
        {contributions && <h3 className="mt-1 text-sm font-medium">Days with the largest revenue change</h3>}
        <DataTable
          caption="Largest daily revenue changes"
          paginate={false}
          columns={[
            // The change is the answer, so it reads first on a phone, before the columns that scroll.
            { key: "date", header: "Selected date", sortable: false },
            { key: "change", header: "Revenue change", align: "right", sortable: false },
            { key: "current", header: "Net revenue", align: "right", sortable: false },
            { key: "baseline", header: "Comparison date", sortable: false },
            { key: "previous", header: "Comparison revenue", align: "right", sortable: false },
          ]}
          rows={changes.map((row) => ({
            id: row.date,
            cells: {
              date: { display: formatDate(row.date) },
              baseline: { display: formatDate(row.baselineDate) },
              current: { display: formatMoney(row.current, currency) },
              previous: { display: formatMoney(row.previous, currency) },
              change: revenueChange(row.difference, currency, "higher"),
            },
          }))}
        />
        {contributions && (
          <>
            <h3 className="mt-3 text-sm font-medium">Sales channels by revenue change</h3>
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
                      { key: "group", header: "Sales channel" },
                      { key: "revenue", header: "Net revenue", align: "right" },
                    ]}
                    rows={period.groups.map((row, index) => ({
                      id: String(index),
                      cells: {
                        group: {
                          display: row.remainder
                            ? "Other groups (bounded remainder)"
                            : row.channel
                              ? channelName(row.channel)
                              : "Unclassified sales channel",
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
                  { key: "group", header: "Sales channel" },
                  { key: "change", header: "Revenue change", align: "right" },
                  { key: "current", header: "Net revenue", align: "right" },
                  { key: "previous", header: "Comparison revenue", align: "right" },
                ]}
                rows={contributions.rows.map((row) => ({
                  id: row.id,
                  cells: {
                    group: { display: row.label },
                    current: { display: formatMoney(row.current, currency) },
                    previous: { display: formatMoney(row.previous, currency) },
                    change: revenueChange(row.difference, currency, row.id === "residual" ? "neutral" : "higher"),
                  },
                }))}
              />
            )}
          </>
        )}
        <Disclosure summary="About these changes" variant="note">
          <div className="max-w-prose space-y-2">
            <p>
              Up to three dates with the largest absolute net-revenue changes against their matched comparison dates.
              Missing values are excluded.
            </p>
            {contributions && (
              <p>
                Sales channels use the same published summary source, store, dates and sales channels as the totals
                above. Unclassified groups remain visible. An absent group has no recorded rows in that period; observed
                movements do not establish causes.
              </p>
            )}
          </div>
        </Disclosure>
      </div>
    </section>
  );
}
