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
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis, usePlotArea } from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableRow } from "@/components/ui/table";
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
import { axisTick, tickTarget, valueTicks, type AxisFormat } from "./compact-number";
import { COMPARISON_DASH } from "@/components/ui/line-swatch";

/** Room for a two-line label beside each horizontal bar. */
const HORIZONTAL_ROW_PX = 40;
const RANK_LABEL_WIDTH = 116;
const RANK_LABEL_HEIGHT = 32;

/**
 * A ranking's value axis: as many nice steps as fit the plot's width, every
 * one labelled, ending at the first step past the longest bar. Before the
 * plot is measured it draws the full five steps.
 */
function RankingValueAxis({ values, format }: { values: number[]; format: (value: number) => string }) {
  const ticks = valueTicks(values, tickTarget(usePlotArea()?.width));
  return (
    <XAxis
      type="number"
      ticks={ticks}
      interval={0}
      domain={[ticks[0] ?? 0, ticks.at(-1) ?? 0]}
      tickLine={false}
      axisLine={false}
      tickFormatter={format}
    />
  );
}

export type ChartSeries = { key: string; label: string; color: string; dashed?: boolean };
export type ChartDatum = { label: string } & Record<string, string | number | null>;

export type ChartCardProps = {
  /** The accessible name of the chart, its table and the card. */
  title: string;
  /** Shown in place of `title`, such as a measure menu; `title` still names the chart. */
  heading?: React.ReactNode;
  description?: string;
  /** How the number is defined; it follows the chart, as the card's last line. */
  definition?: React.ReactNode;
  /** A control for the card as a whole, such as showing every measure; it sits beside the definition. */
  footer?: React.ReactNode;
  kind: "line" | "bar";
  horizontal?: boolean;
  series: ChartSeries[];
  data: ChartDatum[];
  /** False when a value cannot be plotted exactly; the card then opens on the table. */
  plottable?: boolean;
  /** Header for the first table column, such as "Date". */
  categoryHeader: string;
  /** Axis ticks: ratios as percentages, money with the currency from `moneyAxis` (lib/format). */
  valueFormat?: AxisFormat;
  /** Keep single-observation cohort curves visible. */
  showPoints?: boolean;
  /** For the card's place in a layout, such as sharing header rows with a neighbor through a subgrid. */
  className?: string;
};

export function ChartCard({
  title,
  heading,
  description,
  definition,
  footer,
  kind,
  horizontal = false,
  series,
  data,
  plottable = true,
  categoryHeader,
  valueFormat = "number",
  showPoints = false,
  className,
}: ChartCardProps) {
  const [tableChosen, setTableChosen] = useState(false);
  // Derived, so switching to a measure that cannot be plotted always lands on the table.
  const showTable = tableChosen || !plottable;
  const hydrated = useHydrated();
  const regionId = useId();
  const Plot = kind === "line" ? LineChart : BarChart;
  const tickValue = (value: number) => axisTick(value, valueFormat);
  // A currency symbol widens every tick label by its length.
  const affix = typeof valueFormat === "object" ? valueFormat.prefix.length + valueFormat.suffix.length : 0;
  const values = data.flatMap((point) =>
    series.map((item) => point[item.key]).filter((value) => typeof value === "number"),
  );
  const config: ChartConfig = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color, dashed: item.dashed }]),
  );

  return (
    <Card data-agent-target={title} data-agent-component="ChartCard" className={className}>
      {/* The title keeps its width; the view toggle wraps under it when both do not fit. Lines pack to
          the top, so a header stretched to a neighbor's height (a shared subgrid row) still starts level. */}
      <CardHeader className="flex flex-wrap content-start items-center justify-between gap-x-4">
        <CardTitle className="grow">{heading ?? title}</CardTitle>
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
                { label: "Chart", table: false },
                { label: "Table", table: true },
              ].map(({ label, table }) => (
                <Button
                  key={label}
                  variant="ghost"
                  size="sm"
                  aria-label={`View as ${label.toLowerCase()}`}
                  data-agent-element={`View as ${label.toLowerCase()}`}
                  aria-pressed={showTable === table}
                  aria-controls={regionId}
                  onClick={() => setTableChosen(table)}
                  className="px-2.5 text-muted-foreground aria-pressed:bg-segment aria-pressed:text-foreground aria-pressed:shadow-card aria-pressed:ring-1 aria-pressed:ring-border"
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
        </CardAction>
        {description && <CardDescription className="basis-full">{description}</CardDescription>}
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
            {/* Both axes end on a labelled tick, so the plot keeps room at the right for it. */}
            <Plot data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 4, right: 24, top: 8 }}>
              <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--chart-grid)" />
              {horizontal ? (
                <>
                  <RankingValueAxis values={values} format={tickValue} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={128}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                    tick={({ x, y, index, payload, className }) => {
                      const label = String(payload.value);
                      const axisLabel = data[index]?.axisLabel;
                      return (
                        <foreignObject
                          className={className}
                          x={Number(x) - RANK_LABEL_WIDTH}
                          y={Number(y) - RANK_LABEL_HEIGHT / 2}
                          width={RANK_LABEL_WIDTH}
                          height={RANK_LABEL_HEIGHT}
                        >
                          <div className="flex h-full items-center justify-end">
                            <span
                              title={label}
                              className="line-clamp-2 text-right leading-4 wrap-anywhere text-(--chart-axis)"
                            >
                              {typeof axisLabel === "string" ? axisLabel : label}
                            </span>
                          </div>
                        </foreignObject>
                      );
                    }}
                  />
                </>
              ) : (
                <>
                  {/* Thinning keeps the first label and labels every point that fits, so the axis names where the period starts. */}
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={8}
                    interval="preserveStart"
                  />
                  <YAxis tickLine={false} axisLine={false} width={44 + affix * 7} tickFormatter={tickValue} />
                </>
              )}
              <ChartTooltip
                cursor
                filterNull={!(horizontal && series.length > 1)}
                content={<ChartTooltipContent indicator={kind === "line" ? "line" : "dot"} />}
              />
              {series.length > 1 && (
                <ChartLegend
                  itemSorter={null}
                  content={<ChartLegendContent swatch={kind === "line" ? "line" : "square"} />}
                />
              )}
              {series.map((item) =>
                kind === "line" ? (
                  <Line
                    key={item.key}
                    dataKey={item.key}
                    type="linear"
                    stroke={`var(--color-${item.key})`}
                    strokeWidth={2}
                    strokeDasharray={item.dashed ? COMPARISON_DASH : undefined}
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
        {(definition || footer) && (
          <div className="mt-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            {definition ? (
              <Disclosure summary="About this number" variant="note" className="min-w-0 flex-1 open:basis-full">
                <div className="pb-1">{definition}</div>
              </Disclosure>
            ) : (
              <span />
            )}
            {/* As tall as the definition's summary row, so a footer control lines up with it. */}
            {footer && <div className="flex min-h-9 items-center pointer-coarse:min-h-11">{footer}</div>}
          </div>
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
