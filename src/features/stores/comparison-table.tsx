import { DataTable } from "@/components/patterns/data-table";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { compareValues, slotChanges, type ComparisonPlan } from "@/lib/comparison";
import { calendarDate, formatChangePercent, formatDate, formatMeasure, formatMoney } from "@/lib/format";
import { withDates, type DateParams, type DateRange, type SearchParams } from "@/lib/filters";
import { storeReportPath, switchStoreHref } from "@/lib/store-navigation";
import { slotColumn } from "@/lib/data/period-sql";
import type { StoreComparison } from "./queries";
import { Disclosure } from "@/components/ui/disclosure";

export function StoreComparisonTable({
  data,
  range,
  plan,
  params,
  dates,
  now,
}: {
  data: StoreComparison[];
  range: DateRange;
  plan?: ComparisonPlan;
  params: SearchParams;
  /** Each row's link shows exactly these dates, so the store's report matches the row. */
  dates: DateParams;
  now: Date;
}) {
  const path = storeReportPath();
  const slots = plan?.slots ?? [];
  /** The table for one comparison slot; both are rendered and the active one shows. */
  const table = (slot: 0 | 1) => {
    const baseline = plan?.slots[slot];
    const compared = baseline?.range ? baseline : null;
    const notes: { id: string; label: string; issue: string }[] = [];
    const rows = data.map(({ store, currency, summary }) => {
      const coverage = plan ? slotChanges(plan, summary)[slot] : { show: false, issue: null };
      const localToday = store.timeZone ? calendarDate(now, store.timeZone) : null;
      const incomplete = localToday !== null && range.to >= localToday;
      const previous = summary?.[slotColumn(slot, "revenue")];
      const change = compareValues(summary?.revenue ?? null, previous ?? null);
      const issue =
        compared && incomplete
          ? "Today may be incomplete. Changes are hidden until the selected period has ended in this store's local time."
          : coverage.issue;
      if (issue) notes.push({ id: store.id, label: store.label, issue });
      const status = !summary?.latest_date
        ? "No rows in selected period"
        : `Latest recorded summary date: ${formatDate(summary.latest_date)}${incomplete ? " · Today may be incomplete" : coverage.issue ? " · Changes hidden" : ""}`;
      return {
        id: store.id,
        cells: {
          store: {
            display: `${store.label}${data.some((other) => other.store.id !== store.id && other.store.label === store.label) ? ` (${store.id})` : ""}`,
            href: path ? switchStoreHref(path, withDates(params, dates), store.id) : undefined,
          },
          brand: { display: store.brand ?? "—" },
          currency: { display: currency ?? "Unknown" },
          revenue: { display: formatMoney(summary?.revenue ?? null, currency) },
          change: {
            display: issue
              ? "Hidden"
              : !coverage.show
                ? "—"
                : change.percent !== null
                  ? formatChangePercent(change.percent)
                  : change.reason === "zero"
                    ? "Zero baseline"
                    : change.reason === "negative"
                      ? "Negative baseline"
                      : "No comparison value",
            sort: coverage.show && !issue && change.percent !== null ? Number(change.percent) : null,
          },
          orders: { display: formatMeasure(summary?.orders ?? null), sort: summary?.orders ?? null },
          spend: { display: formatMoney(summary?.spend ?? null, currency) },
          status: { display: status },
        },
      };
    });
    return (
      <div className="flex flex-col gap-4">
        <DataTable
          caption="Store performance"
          rows={rows}
          columns={[
            { key: "store", header: "Store" },
            ...(data.some(({ store }) => store.brand) ? [{ key: "brand", header: "Brand" }] : []),
            { key: "currency", header: "Currency" },
            { key: "revenue", header: "Net revenue", align: "right", sortable: false },
            ...(compared
              ? [
                  {
                    key: "change",
                    header: `Revenue change vs ${compared.label}`,
                    align: "right" as const,
                    sortable: false,
                  },
                ]
              : []),
            { key: "orders", header: "Summary orders", align: "right" },
            { key: "spend", header: "Ad spend", align: "right", sortable: false },
            { key: "status", header: "Selected-period records", sortable: false },
          ]}
        />
        {!!notes.length && (
          <Disclosure summary="Why some changes are hidden" className="text-sm text-muted-foreground">
            <ul className="flex max-w-prose flex-col gap-2">
              {notes.map((note) => (
                <li key={note.id}>
                  <span className="font-medium">{note.label}:</span> {note.issue}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">
        Each store uses its own reporting currency. Revenue and spend are shown separately, without combined totals or
        rankings across currencies. Summary orders can include fractional attribution.
      </p>
      {slots.length ? <ActiveBaseline a={table(0)} b={table(1)} /> : table(0)}
      <p className="text-xs text-muted-foreground">
        Selected-period records describe rows in the selected dates, not warehouse freshness. Pipeline freshness, period
        completeness and quality checks are not published for any store.{" "}
        {data.some(({ store }) => store.timeZone === null) &&
          "Some stores have no known time zone; their current-day completeness is unknown."}
      </p>
    </div>
  );
}
