import "server-only";
import { DataTable, type DataTableCell } from "@/components/patterns/data-table";
import { changeTone, type Baseline, type Polarity } from "@/lib/comparison";
import type { revenueContributions } from "./contributions";
import { largestRevenueChanges } from "./revenue-changes";
import { toUnits } from "@/lib/data/decimal";
import Link from "next/link";
import { CHANGE_TONE_CLASS } from "@/components/patterns/change-tone";
import { withParams, type SearchParams } from "@/lib/filters";
import { formatDate, formatMoney } from "@/lib/format";
import type { OverviewFilters, OverviewSlice } from "./queries";
import { SectionHeader } from "@/components/patterns/section-header";
import { Disclosure } from "@/components/ui/disclosure";

function revenueCell(value: string | null, currency: string | null): DataTableCell {
  return { display: formatMoney(value, currency), sort: value === null ? null : toUnits(value) };
}

/** A signed revenue difference, colored by `better`; a reconciliation residual passes "neutral". */
function revenueChange(difference: string | null, currency: string | null, better: Polarity): DataTableCell {
  const units = difference === null ? null : toUnits(difference);
  return {
    display: `${units !== null && units > 0n ? "+" : ""}${formatMoney(difference, currency)}`,
    sort: units,
    tone:
      units === null ? undefined : (changeTone(units > 0n ? "up" : units < 0n ? "down" : "flat", better) ?? undefined),
  };
}

type Contributions = ReturnType<typeof revenueContributions>;

export function ChannelChanges({
  contributions,
  baseline,
  params,
  currency,
}: {
  contributions: Contributions;
  baseline: Baseline;
  params: SearchParams;
  currency: string | null;
}) {
  if (!contributions) return null;
  const rows = contributions.rows.filter((row) => row.difference !== null).slice(0, 3);
  if (!rows.length) return null;
  return (
    <section
      aria-label="Revenue change by channel"
      className="min-w-0 border-t px-5 pt-2 sm:border-s sm:border-t-0 sm:py-1"
    >
      <h2 className="font-semibold">Revenue change by channel</h2>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
        <span>vs {baseline.label}</span>
        <a className="underline underline-offset-4" href="#channel-breakdown">
          All channel values
        </a>
      </div>
      <ul className="divide-y">
        {rows.map((row) => {
          const change = revenueChange(row.difference, currency, row.id === "residual" ? "neutral" : "higher");
          const href = row.trendChannel
            ? withParams("/overview", params, { sales_channel: row.trendChannel, metric: "revenue" }) +
              "#performance-trends"
            : undefined;
          return (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5 text-sm">
              {href ? (
                <Link
                  prefetch={false}
                  className="min-w-0 font-medium wrap-anywhere text-primary underline decoration-primary/40 underline-offset-4"
                  href={href}
                >
                  {row.label}
                </Link>
              ) : (
                <span className="min-w-0 wrap-anywhere">{row.label}</span>
              )}
              <span
                className={`font-medium wrap-anywhere tabular-nums ${change.tone ? CHANGE_TONE_CLASS[change.tone] : ""}`}
              >
                {change.display}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function OverviewHighlights({
  report,
  contributions,
  filters,
  comparison,
  currency,
}: {
  report: OverviewSlice;
  contributions: Contributions;
  filters: OverviewFilters;
  comparison?: Baseline;
  currency: string | null;
}) {
  const changes = largestRevenueChanges(report, filters, comparison);
  // Named once for the section, so the change columns keep short headers that fit a phone.
  const versus = comparison?.range ? `vs ${comparison.short}` : null;
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
          stackOnMobile
          caption="Largest daily revenue changes"
          paginate={false}
          columns={[
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
              current: revenueCell(row.current, currency),
              previous: revenueCell(row.previous, currency),
              change: revenueChange(row.difference, currency, "higher"),
            },
          }))}
        />
        {contributions && (
          <Disclosure summary="All channel values">
            <div id="channel-breakdown">
              <DataTable
                stackOnMobile
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
                    current: revenueCell(row.current, currency),
                    previous: revenueCell(row.previous, currency),
                    change: revenueChange(row.difference, currency, row.id === "residual" ? "neutral" : "higher"),
                  },
                }))}
              />
            </div>
          </Disclosure>
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
