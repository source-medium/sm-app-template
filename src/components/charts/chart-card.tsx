"use client";

/**
 * One chart in a card, with a "View as table" toggle that is its
 * accessibility fallback. Every value arrives from the server already
 * formatted (`<key>__display`); the chart plots the numeric `<key>`.
 *
 * Marks follow the data-viz spec: 2px lines, bars at most 24px with a 4px
 * rounded end, hairline horizontal grid, one y-axis, a legend whenever there
 * are two or more series.
 */
import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { compactNumber } from "./compact-number";

export type ChartSeries = { key: string; label: string; color: string; dashed?: boolean };
export type ChartDatum = { label: string } & Record<string, string | number | null>;

export type ChartCardProps = {
  title: string;
  description?: string;
  kind: "line" | "bar";
  horizontal?: boolean;
  series: ChartSeries[];
  data: ChartDatum[];
  /** False when a value cannot be plotted exactly; the card then opens on the table. */
  plottable?: boolean;
  /** Header for the first table column, such as "Date". */
  categoryHeader: string;
};

export function ChartCard({
  title,
  description,
  kind,
  horizontal = false,
  series,
  data,
  plottable = true,
  categoryHeader,
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(!plottable);
  const regionId = useId();
  const Plot = kind === "line" ? LineChart : BarChart;
  const config: ChartConfig = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          {plottable && (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={showTable}
              aria-controls={regionId}
              onClick={() => setShowTable((value) => !value)}
            >
              {showTable ? "View as chart" : "View as table"}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent id={regionId}>
        {!plottable && (
          <p className="mb-3 text-sm text-muted-foreground">
            Some values are too large to plot exactly, so this shows the table.
          </p>
        )}
        {showTable ? (
          <ChartTable title={title} categoryHeader={categoryHeader} series={series} data={data} />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-64 w-full" role="img" aria-label={`${title} chart`}>
            <Plot data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--chart-grid)" />
              {horizontal ? (
                <>
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={compactNumber} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={100}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(label: string) => (label.length > 16 ? `${label.slice(0, 15)}…` : label)}
                  />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={compactNumber} />
                </>
              )}
              <ChartTooltip cursor content={<ChartTooltipContent indicator={kind === "line" ? "line" : "dot"} />} />
              {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
              {series.map((item) =>
                kind === "line" ? (
                  <Line
                    key={item.key}
                    dataKey={item.key}
                    type="linear"
                    stroke={`var(--color-${item.key})`}
                    strokeWidth={2}
                    strokeDasharray={item.dashed ? "6 4" : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ) : (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    fill={`var(--color-${item.key})`}
                    radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                    maxBarSize={24}
                    isAnimationActive={false}
                  />
                ),
              )}
            </Plot>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function ChartTable({
  title,
  categoryHeader,
  series,
  data,
}: {
  title: string;
  categoryHeader: string;
  series: ChartSeries[];
  data: ChartDatum[];
}) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <caption className="sr-only">{title}</caption>
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              {categoryHeader}
            </th>
            {series.map((item) => (
              <th key={item.key} scope="col" className="px-3 py-2 text-right font-medium">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.label} className="border-t">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {datum.label}
              </th>
              {series.map((item) => (
                <td key={item.key} className="px-3 py-2 text-right tabular-nums">
                  {String(datum[`${item.key}__display`] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
