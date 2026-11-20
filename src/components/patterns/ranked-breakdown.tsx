import { ChartCard } from "@/components/charts/chart-card";
import type { AxisFormat } from "@/components/charts/compact-number";
import { buildChartData } from "@/components/charts/chart-data";
import { decimalToNumber } from "@/lib/data/decimal";
import type { Polarity } from "@/lib/comparison";
import { formatLabel, formatShare } from "@/lib/format";
import { DataTable } from "./data-table";
import { changeCell, kpiDelta } from "./kpi-delta";

/**
 * The feature ranks the rows and supplies their full-query shares. The chart
 * and the change column compare the same two values for each ranked key. A share is null where it is undefined (a negative
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
  baselineLabel,
  formatValue,
  better,
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
    value: string | null;
    baseline: string | null;
    share: number | null;
    href?: string;
    leading?: React.ReactNode;
  }[];
  hasMore?: boolean;
  /** Active comparison's short name, only when period totals can be compared. */
  baselineLabel?: string;
  formatValue: (value: string | null) => string;
  better: Polarity;
  /** The chart axis's format; money passes `moneyAxis(currency)` so its ticks carry the currency. */
  valueFormat?: AxisFormat;
}) {
  const chart = buildChartData(
    rows.map((row) => ({
      label: row.label,
      values: {
        value: { value: decimalToNumber(row.value), display: formatValue(row.value) },
        ...(baselineLabel && {
          baseline: {
            value: decimalToNumber(row.baseline),
            display: row.baseline === null ? "No value" : formatValue(row.baseline),
          },
        }),
      },
    })),
  );
  const noBaselineValues = baselineLabel && rows.length > 0 && rows.every((row) => row.baseline === null);
  return (
    <div className="flex flex-col gap-3">
      <ChartCard
        title={title}
        description={
          noBaselineValues ? `${description} These ranked rows have no values in the comparison period.` : description
        }
        kind="bar"
        horizontal
        categoryHeader={categoryLabel}
        series={[
          { key: "value", label: baselineLabel ? "Selected period" : valueLabel, color: "var(--chart-1)" },
          ...(baselineLabel ? [{ key: "baseline", label: formatLabel(baselineLabel), color: "var(--chart-2)" }] : []),
        ]}
        data={chart.data.map((point, index) => ({ ...point, axisLabel: rows[index]?.chartLabel ?? point.label }))}
        plottable={chart.plottable}
        valueFormat={valueFormat}
      />
      <DataTable
        caption={`${title} details`}
        paginate={false}
        stackOnMobile
        truncated={hasMore}
        columns={[
          { key: "name", header: categoryLabel, sortable: false },
          { key: "value", header: valueLabel, align: "right", sortable: false },
          ...(baselineLabel
            ? [{ key: "change", header: `Change vs ${baselineLabel}`, align: "right" as const, sortable: false }]
            : []),
          ...(rows.some((row) => row.share !== null)
            ? [{ key: "share", header: "Share of total", align: "right" as const, sortable: false }]
            : []),
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            name: { display: row.label, href: row.href, leading: row.leading },
            value: { display: formatValue(row.value) },
            share: { display: formatShare(row.share) },
            ...(baselineLabel && { change: changeCell(kpiDelta(row.value, row.baseline, formatValue, better)) }),
          },
        }))}
      />
    </div>
  );
}
