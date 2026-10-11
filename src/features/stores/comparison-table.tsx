import { DataTable } from "@/components/patterns/data-table";
import { compareValues, periodChanges } from "@/lib/comparison";
import { calendarDate, formatChangePercent, formatDate, formatMeasure, formatMoney } from "@/lib/format";
import type { DateRange, SearchParams } from "@/lib/filters";
import { storeReportPath, switchStoreHref } from "@/lib/store-navigation";
import type { StoreComparison } from "./queries";

export function StoreComparisonTable({
  data,
  range,
  baseline,
  params,
  now,
}: {
  data: StoreComparison[];
  range: DateRange;
  baseline: DateRange | null;
  params: SearchParams;
  now: Date;
}) {
  const path = storeReportPath();
  const notes: { id: string; label: string; issue: string }[] = [];
  const rows = data.map(({ store, currency, summary }) => {
    const coverage = periodChanges(range, baseline, summary);
    const localToday = store.timeZone ? calendarDate(now, store.timeZone) : null;
    const incomplete = localToday !== null && range.to >= localToday;
    const change = compareValues(summary?.revenue ?? null, summary?.previous_revenue ?? null);
    const issue =
      baseline && incomplete
        ? "Today may be incomplete. Changes are hidden until the selected period has ended in this store's local time."
        : coverage.issue;
    if (issue) notes.push({ id: store.id, label: store.label, issue });
    const status = !summary?.latest_date
      ? "No rows in selected period"
      : `Rows through ${formatDate(summary.latest_date)}${incomplete ? " · Today may be incomplete" : coverage.issue ? " · Changes hidden" : ""}`;
    return {
      id: store.id,
      cells: {
        store: {
          display: `${store.label}${data.some((other) => other.store.id !== store.id && other.store.label === store.label) ? ` (${store.id})` : ""}`,
          href: path ? switchStoreHref(path, { ...params, ...range }, store.id) : undefined,
        },
        brand: { display: store.brand ?? "—" },
        currency: { display: currency ?? "Unverified" },
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
      <p className="max-w-prose text-sm text-muted-foreground">
        Each store uses its own reporting currency. Revenue and spend are shown separately, without combined totals or
        rankings across currencies. Summary orders can include fractional attribution.
      </p>
      <DataTable
        caption="Store performance"
        rows={rows}
        columns={[
          { key: "store", header: "Store" },
          ...(data.some(({ store }) => store.brand) ? [{ key: "brand", header: "Brand" }] : []),
          { key: "currency", header: "Currency" },
          { key: "revenue", header: "Net revenue", align: "right", sortable: false },
          ...(baseline ? [{ key: "change", header: "Revenue change", align: "right" as const }] : []),
          { key: "orders", header: "Summary orders", align: "right" },
          { key: "spend", header: "Ad spend", align: "right", sortable: false },
          { key: "status", header: "Period coverage", sortable: false },
        ]}
      />
      {!!notes.length && (
        <details className="text-sm text-muted-foreground">
          <summary className="w-fit cursor-pointer font-medium">Why some changes are hidden</summary>
          <ul className="mt-2 flex max-w-prose flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id}>
                <span className="font-medium">{note.label}:</span> {note.issue}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        Period coverage describes rows in the selected dates, not warehouse freshness.{" "}
        {data.some(({ store }) => store.timeZone === null) &&
          "Some stores have no known time zone; their current-day completeness is unknown."}
      </p>
    </div>
  );
}
