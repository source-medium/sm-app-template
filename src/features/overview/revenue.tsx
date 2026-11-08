import { DataTable } from "@/components/patterns/data-table";
import { changeCell, kpiDelta } from "@/components/patterns/kpi-delta";
import type { Polarity } from "@/lib/comparison";
import { fromUnits, toUnits } from "@/lib/data/decimal";
import { formatMoneyIn } from "@/lib/format";
import type { RevenueDeductions } from "./queries";
import { Disclosure } from "@/components/ui/disclosure";

/** Signed deductions are already negative. Missing inputs never become zero adjustments. */
export function revenueDifference(value: RevenueDeductions | null): string | null {
  if (!value) return null;
  const { net, gross, discounts, refunds } = value;
  if (net === null || gross === null || discounts === null || refunds === null) return null;
  return fromUnits(toUnits(net) - toUnits(gross) - toUnits(discounts) - toUnits(refunds));
}

export function OverviewRevenue({
  current,
  previous,
  compare,
  currency,
}: {
  current: RevenueDeductions | null;
  previous: RevenueDeductions | null;
  compare: boolean;
  currency: string | null;
}) {
  const money = formatMoneyIn(currency);
  const difference = revenueDifference(current);
  // Deductions keep their source signs (negative), so refunds closer to zero are better. Discounts are a choice, not a result.
  const measures = [
    { key: "gross", label: "Gross revenue", better: "higher" },
    { key: "discounts", label: "Discounts", better: "neutral" },
    { key: "refunds", label: "Refunds", better: "higher" },
    { key: "net", label: "Net revenue", better: "higher" },
  ] as const satisfies readonly { key: string; label: string; better: Polarity }[];
  return (
    <Disclosure summary="Revenue and deductions">
      <div className="flex min-w-0 flex-col gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Published summary amounts for the selected dates and sales channels. Discounts and refunds retain their source
          signs. This is not a refund-event timeline.
        </p>
        <DataTable
          caption="Revenue and deductions"
          paginate={false}
          columns={[
            { key: "measure", header: "Measure", sortable: false },
            { key: "value", header: "Amount", align: "right", sortable: false },
            ...(compare
              ? [{ key: "change", header: "Change vs comparison", align: "right" as const, sortable: false }]
              : []),
          ]}
          rows={measures.map(({ key, label, better }) => ({
            id: key,
            cells: {
              measure: { display: label },
              value: { display: money(current?.[key] ?? null) },
              change: changeCell(kpiDelta(current?.[key] ?? null, previous?.[key] ?? null, money, better)),
            },
          }))}
        />
        {difference === null ? (
          <p className="text-sm text-muted-foreground">
            Reconciliation unavailable because a published amount is missing.
          </p>
        ) : difference !== "0" ? (
          <p className="text-sm text-muted-foreground">
            Unreconciled difference: {money(difference)}. Published net revenue differs from gross revenue plus signed
            discounts and refunds. The source does not identify the remaining adjustments.
          </p>
        ) : null}
      </div>
    </Disclosure>
  );
}
