import { ChartCard } from "@/components/charts/chart-card";
import { buildChartData, type PointValue } from "@/components/charts/chart-data";
import { DataTable } from "./data-table";

/** The feature supplies ranking, full-query shares, and formatted changes. This pattern only presents them. */
export function RankedBreakdown({
  title,
  description,
  valueLabel,
  rows,
  hasMore = false,
  comparisonLabel,
}: {
  title: string;
  description: string;
  valueLabel: string;
  rows: { id: string; label: string; value: PointValue; share: string; change?: string; href?: string }[];
  hasMore?: boolean;
  comparisonLabel?: string;
}) {
  const chart = buildChartData(rows.map((row) => ({ label: row.label, values: { value: row.value } })));
  return (
    <div className="flex flex-col gap-3">
      <ChartCard
        title={title}
        description={description}
        kind="bar"
        horizontal
        categoryHeader="Name"
        series={[{ key: "value", label: valueLabel, color: "var(--chart-1)" }]}
        data={chart.data}
        plottable={chart.plottable}
      />
      <DataTable
        caption={`${title} details`}
        paginate={false}
        truncated={hasMore}
        columns={[
          { key: "name", header: "Name", sortable: false },
          { key: "value", header: valueLabel, align: "right", sortable: false },
          { key: "share", header: "Share of total", align: "right", sortable: false },
          ...(comparisonLabel
            ? [{ key: "change", header: comparisonLabel, align: "right" as const, sortable: false }]
            : []),
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            name: { display: row.label, href: row.href },
            value: { display: row.value.display },
            share: { display: row.share },
            change: { display: row.change ?? "—" },
          },
        }))}
      />
    </div>
  );
}
