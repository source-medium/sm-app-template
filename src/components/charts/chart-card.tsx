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
import { ChartNoAxesCombined, Table2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { Disclosure } from "@/components/ui/disclosure";
import { useHydrated } from "@/hooks/use-hydrated";
import { compactNumber } from "./compact-number";

/** Room for a two-line label beside each horizontal bar. */
const HORIZONTAL_ROW_PX = 40;

export type ChartSeries = { key: string; label: string; color: string; dashed?: boolean };
export type ChartDatum = { label: string } & Record<string, string | number | null>;

export type ChartCardProps = {
  /** The accessible name of the chart, its table and the card. */
  title: string;
  /** Shown in place of `title`, such as a measure menu; `title` still names the chart. */
  heading?: React.ReactNode;
  description?: string;
  definition?: React.ReactNode;
  kind: "line" | "bar";
  horizontal?: boolean;
  series: ChartSeries[];
  data: ChartDatum[];
  /** False when a value cannot be plotted exactly; the card then opens on the table. */
  plottable?: boolean;
  /** Header for the first table column, such as "Date". */
  categoryHeader: string;
  /** Ratio values use percentage ticks; labels and tooltips still arrive formatted by the server. */
  valueFormat?: "number" | "percent";
  /** Keep single-observation cohort curves visible. */
  showPoints?: boolean;
};

export function ChartCard({
  title,
  heading,
  description,
  definition,
  kind,
  horizontal = false,
  series,
  data,
  plottable = true,
  categoryHeader,
  valueFormat = "number",
  showPoints = false,
}: ChartCardProps) {
  const [tableChosen, setTableChosen] = useState(false);
  // Derived, so switching to a measure that cannot be plotted always lands on the table.
  const showTable = tableChosen || !plottable;
  const hydrated = useHydrated();
  const regionId = useId();
  const Plot = kind === "line" ? LineChart : BarChart;
  const tickValue = (value: number) =>
    valueFormat === "percent" ? `${compactNumber(value * 100)}%` : compactNumber(value);
  const config: ChartConfig = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  );

  return (
    <Card data-agent-target={title} data-agent-component="ChartCard">
      <CardHeader>
        <CardTitle>{heading ?? title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {definition && (
          <Disclosure summary="About this number">
            <div className="pb-1">{definition}</div>
          </Disclosure>
        )}
        <CardAction>
          {plottable && (
            // A click before hydration would be lost, so the toggle accepts none until it can apply one.
            <div
              role="group"
              aria-label={`${title} display`}
              inert={!hydrated}
              className="flex rounded-md bg-muted p-1"
            >
              {[
                { label: "Chart", table: false, icon: ChartNoAxesCombined },
                { label: "Table", table: true, icon: Table2 },
              ].map(({ label, table, icon: Icon }) => (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`View as ${label.toLowerCase()}`}
                      data-agent-element={`View as ${label.toLowerCase()}`}
                      aria-pressed={showTable === table}
                      aria-controls={regionId}
                      onClick={() => setTableChosen(table)}
                      className="min-w-8 px-2 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-card"
                    >
                      <Icon aria-hidden />
                      <span className="hidden @min-[28rem]/card-header:inline">{label}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{label} view</TooltipContent>
                </Tooltip>
              ))}
            </div>
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
          <ChartContainer
            config={config}
            className={cn("aspect-auto w-full", !horizontal && "h-64")}
            // A ranking labels every bar, so its height follows the row count.
            style={horizontal ? { height: Math.max(256, data.length * HORIZONTAL_ROW_PX) } : undefined}
            role="img"
            aria-label={`${title} chart`}
          >
            <Plot data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--chart-grid)" />
              {horizontal ? (
                <>
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={tickValue} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={128}
                    interval={0}
                    tick={{ width: 116 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(label: string, index: number) => {
                      const axisLabel = data[index]?.axisLabel;
                      const text = typeof axisLabel === "string" ? axisLabel : label;
                      return text.length > 22 ? `${text.slice(0, 21)}…` : text;
                    }}
                  />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={tickValue} />
                </>
              )}
              <ChartTooltip cursor content={<ChartTooltipContent indicator={kind === "line" ? "line" : "dot"} />} />
              {series.length > 1 && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
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
                    dot={showPoints ? { r: 3, strokeWidth: 0, fill: `var(--color-${item.key})` } : false}
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
    <Table containerClassName="max-h-80 rounded-md border" regionLabel={`${title} table`}>
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
          <TableRow key={datum.label} className="border-t border-b-0">
            <th scope="row" className="px-3 py-2 text-left font-normal">
              {datum.label}
            </th>
            {series.map((item) => (
              <td key={item.key} className="px-3 py-2 text-right tabular-nums">
                {String(datum[`${item.key}__display`] ?? "—")}
              </td>
            ))}
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}
