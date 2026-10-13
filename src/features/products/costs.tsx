import { formatCount, formatMeasure, formatPercent } from "@/lib/format";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import type { ProductCoverage } from "./rows";
import { SectionHeader } from "@/components/patterns/section-header";

export function ProductCosts({ data, diagnostic }: { data: ProductCoverage; diagnostic: "cost" | "refunds" }) {
  const ordered = decimalToNumber(data.ordered_units);
  const rate = ordered !== null && ordered > 0 ? ratio(decimalToNumber(data.refunded_units), ordered) : null;
  return (
    <section aria-labelledby="product-coverage-heading" className="flex flex-col gap-2">
      <SectionHeader
        id="product-coverage-heading"
        title={diagnostic === "cost" ? "Product cost coverage" : "Product refund rate"}
      />
      {diagnostic === "cost" ? (
        <>
          <p className="text-sm">
            {formatCount(data.missing_cost_lines)} lines with missing published cost;{" "}
            {formatCount(data.zero_cost_lines)} with zero cost, out of {formatCount(data.lines)} valid-order product
            lines.
          </p>
          <p className="max-w-prose text-sm text-muted-foreground">
            A published zero may be intentional or reflect an unconfigured cost. Presence alone does not establish cost
            completeness.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm">
            {formatMeasure(data.refunded_units)} refunded units / {formatMeasure(data.ordered_units)} ordered units (
            {formatPercent(rate)}) across all matching products.
          </p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Refunds follow the original order date, so rates can change as later refunds arrive.
          </p>
        </>
      )}
    </section>
  );
}
