import "server-only";
import { appConfig } from "@/app.config";
import { DataTable } from "@/components/patterns/data-table";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { formatMeasure, formatMoney, formatMoneyIn } from "@/lib/format";
import type { PurchaseMix } from "./queries";

export function OverviewPurchases({
  current,
  previous,
  comparedTo,
  currency = appConfig.currency,
}: {
  current: PurchaseMix | null;
  previous: PurchaseMix | null;
  comparedTo?: string;
  currency?: string | null;
}) {
  const money = formatMoneyIn(currency);
  const rows = (["first", "repeat"] as const).map((key) => {
    const measures = current?.[key];
    const baseline = previous?.[key];
    const revenue = measures?.netRevenue ?? null;
    const orders = measures?.orders ?? null;
    return {
      id: key,
      cells: {
        purchase: { display: key === "first" ? "New-customer orders" : "Repeat-customer orders" },
        revenue: { display: formatMoney(revenue, currency) },
        orders: { display: formatMeasure(orders) },
        average: { display: formatMoney(ratio(decimalToNumber(revenue), orders), currency) },
        change: { display: kpiDelta(revenue, baseline?.netRevenue ?? null, money).display },
      },
    };
  });
  return (
    <section aria-labelledby="purchases-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="purchases-heading" className="text-lg font-semibold">
          New vs repeat purchases
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Published new- and repeat-customer order measures for the selected store, dates and sales channel. Counts are
          orders, not unique people. Classification coverage varies by source, so these rows may not add up to the
          headline totals.
        </p>
        {comparedTo && <p className="mt-1 text-sm text-muted-foreground">Revenue change vs {comparedTo}.</p>}
      </div>
      <DataTable
        caption="New vs repeat purchases"
        paginate={false}
        columns={[
          { key: "purchase", header: "Purchase type", sortable: false },
          { key: "revenue", header: "Net revenue", align: "right", sortable: false },
          { key: "orders", header: "Summary orders", align: "right", sortable: false },
          { key: "average", header: "Net revenue / order", align: "right", sortable: false },
          ...(comparedTo
            ? [{ key: "change", header: "Revenue change", align: "right" as const, sortable: false }]
            : []),
        ]}
        rows={rows}
      />
    </section>
  );
}
