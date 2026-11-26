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
 * filled with dashes. An explorer leads with the table (`tableFirst`, under
 * a header its page supplies): its footer carries the paging, and the chart
 * below plots at most `chartRows` of the rows, or nothing when none are given.
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
  tableFirst = false,
  tableActions,
  chartRows,
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
  tableFirst?: boolean;
  /** Controls in the table's footer, such as server paging links. */
  tableActions?: React.ReactNode;
  /** How many of the rows the chart plots; all by default. */
  chartRows?: number;
}) {
  const plotted = rows.slice(0, chartRows ?? rows.length);
  const chart = buildChartData(
    plotted.map((row) => ({
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
  // Other views keep their chart card even without rows; an explorer shows one only with rows to plot.
  const chartCard = (tableFirst ? plotted.length > 0 : chartRows !== 0) && (
    <ChartCard
      title={title}
      description={[
        description,
        tableFirst && plotted.length < rows.length && `The chart shows the first ${plotted.length}.`,
        noBaselineValues && "These ranked rows have no values in the comparison period.",
      ]
        .filter(Boolean)
        .join(" ")}
      kind="bar"
      horizontal
      categoryHeader={categoryLabel}
      series={[
        { key: "value", label: baselineLabel ? "Selected period" : valueLabel, color: "var(--chart-1)" },
        ...(baselineLabel ? [{ key: "baseline", label: formatLabel(baselineLabel), color: "var(--chart-2)" }] : []),
      ]}
      data={chart.data.map((point, index) => ({ ...point, axisLabel: plotted[index]?.chartLabel ?? point.label }))}
      plottable={chart.plottable}
      valueFormat={valueFormat}
    />
  );
  const table = (
    <DataTable
      caption={`${title} details`}
      paginate={false}
      stackOnMobile
      truncated={hasMore}
      actions={tableActions}
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
  );
  return (
    <div className="flex flex-col gap-3">
      {tableFirst ? table : chartCard}
      {tableFirst ? chartCard : table}
    </div>
  );
}
