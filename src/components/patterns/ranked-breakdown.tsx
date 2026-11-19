import { ChartCard } from "@/components/charts/chart-card";
import type { AxisFormat } from "@/components/charts/compact-number";
import { buildChartData, type PointValue } from "@/components/charts/chart-data";
import { formatShare } from "@/lib/format";
import { DataTable, type DataTableCell } from "./data-table";

/**
 * The feature supplies ranking, full-query shares, and formatted changes. This
 * pattern only presents them. A share is null where it is undefined (a negative
 * value in the set); when no row has one, the column is left out rather than
 * filled with dashes.
 */
export function RankedBreakdown({
  title,
  description,
  categoryLabel,
  valueLabel,
  rows,
  hasMore = false,
  comparisonLabel,
  valueFormat,
}: {
  title: string;
  description: string;
  /** What the rows are, such as "Ad platform" or "Product"; it heads the first column. */
  categoryLabel: string;
  valueLabel: string;
  rows: {
    id: string;
    label: string;
    chartLabel?: string;
    value: PointValue;
    share: number | null;
    /** From changeCell(), so the change is colored by its measure's polarity. */
    change?: DataTableCell;
    href?: string;
    leading?: React.ReactNode;
  }[];
  hasMore?: boolean;
  comparisonLabel?: string;
  /** The chart axis's format; money passes `moneyAxis(currency)` so its ticks carry the currency. */
  valueFormat?: AxisFormat;
}) {
  const chart = buildChartData(rows.map((row) => ({ label: row.label, values: { value: row.value } })));
  return (
    <div className="flex flex-col gap-3">
      <ChartCard
        title={title}
        description={description}
        kind="bar"
        horizontal
        categoryHeader={categoryLabel}
        series={[{ key: "value", label: valueLabel, color: "var(--chart-1)" }]}
        data={chart.data.map((point, index) => ({ ...point, axisLabel: rows[index]?.chartLabel ?? point.label }))}
        plottable={chart.plottable}
        valueFormat={valueFormat}
      />
      <DataTable
        caption={`${title} details`}
        paginate={false}
        truncated={hasMore}
        columns={[
          { key: "name", header: categoryLabel, sortable: false },
          { key: "value", header: valueLabel, align: "right", sortable: false },
          ...(comparisonLabel
            ? [{ key: "change", header: comparisonLabel, align: "right" as const, sortable: false }]
            : []),
          ...(rows.some((row) => row.share !== null)
            ? [{ key: "share", header: "Share of total", align: "right" as const, sortable: false }]
            : []),
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            name: { display: row.label, href: row.href, leading: row.leading },
            value: { display: row.value.display },
            share: { display: formatShare(row.share) },
            change: row.change ?? { display: "—" },
          },
        }))}
      />
    </div>
  );
}
