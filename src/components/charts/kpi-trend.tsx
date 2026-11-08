import { toChartNumber } from "@/lib/data/decode";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";

type TrendValues = readonly (number | bigint | null)[];
/** One comparison period's values, aligned to the selected dates with comparisonDates(); null is a gap. */
export type KpiTrendComparison = { label: string; values: TrendValues };
export type KpiTrendData = {
  /** One point per day, or per week for a long period (`grain: "week"`). */
  values: TrendValues;
  grain?: "day" | "week";
  tableHref: string;
  /** Each comparison slot's aligned values, in slot order; the one the report's switch picks is drawn dashed behind. */
  comparisons?: readonly (KpiTrendComparison | null)[];
};

const numbers = (raw: TrendValues) => raw.map((value) => (value === null ? null : toChartNumber(value)));
const exact = (raw: TrendValues, values: (number | null)[]) =>
  raw.every((value, index) => value === null || values[index] !== null);

/** SVG path for one series on a shared scale; a missing day breaks the line. */
function linePath(values: (number | null)[], scale: { min: number; max: number; size: number }) {
  const points = values.map((value, index) =>
    value === null
      ? null
      : {
          x: values.length === 1 ? 100 : 2 + (index / (values.length - 1)) * 196,
          y: scale.max === scale.min ? 22 : 42 - ((value / scale.size - scale.min) / (scale.max - scale.min)) * 40,
        },
  );
  return {
    points,
    d: points.map((point, index) => (point ? `${points[index - 1] ? "L" : "M"}${point.x},${point.y}` : "")).join(" "),
  };
}

function Sparkline({
  label,
  grain,
  values,
  comparison,
}: {
  label: string;
  grain: "day" | "week";
  values: (number | null)[];
  comparison: { label: string; values: (number | null)[] } | null;
}) {
  // One scale for both lines, normalized first so large finite values cannot overflow the span.
  const present = [...values, ...(comparison?.values ?? [])].filter((value): value is number => value !== null);
  const size = Math.max(1, ...present.map(Math.abs));
  const scale = { min: Math.min(...present) / size, max: Math.max(...present) / size, size };
  const current = linePath(values, scale);
  const prior = comparison ? linePath(comparison.values, scale) : null;
  return (
    <svg
      role="img"
      aria-label={`${label}: ${grain === "week" ? "weekly" : "daily"} trend for the selected period${comparison ? `, with the ${comparison.label} dashed behind it` : ""}. Missing ${grain}s are gaps.`}
      viewBox="0 0 200 44"
      preserveAspectRatio="none"
      className="h-11 w-full"
    >
      {prior && (
        <path
          d={prior.d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeOpacity="0.75"
          vectorEffect="non-scaling-stroke"
          className="text-chart-2"
        />
      )}
      <path
        d={current.d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="text-chart-1"
      />
      {current.points.map((point, index) =>
        point && !current.points[index - 1] && !current.points[index + 1] ? (
          <circle key={index} cx={point.x} cy={point.y} r="2" fill="currentColor" className="text-chart-1" />
        ) : null,
      )}
    </svg>
  );
}

/**
 * A server-rendered trend linked to its existing detail table, with no extra
 * chart JavaScript. With comparisons, the period the report's switch shows is
 * drawn dashed behind on the same scale, as in the report's main chart.
 */
export function KpiTrend({
  label,
  values: raw,
  tableHref,
  comparisons,
  grain = "day",
}: KpiTrendData & { label: string }) {
  // One point is not a trend; the card's value already says it.
  if (raw.length < 2) return null;
  const values = numbers(raw);
  const prior = (comparisons ?? []).map((comparison) => {
    if (!comparison) return null;
    const aligned = numbers(comparison.values);
    // A comparison that cannot be plotted exactly is left out, never drawn approximately.
    return exact(comparison.values, aligned) && aligned.some((value) => value !== null)
      ? { label: comparison.label, values: aligned }
      : null;
  });
  const plottable = exact(raw, values);
  const present = values.some((value) => value !== null);
  const line = (slot: 0 | 1) => (
    <Sparkline label={label} grain={grain} values={values} comparison={prior[slot] ?? null} />
  );
  return (
    <a
      href={tableHref}
      aria-label={`View daily values for ${label}`}
      title="View daily values"
      className="mt-2 block min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {plottable && present ? (
        comparisons ? (
          <ActiveBaseline a={line(0)} b={line(1)} />
        ) : (
          line(0)
        )
      ) : (
        <span className="flex h-11 items-center text-xs text-muted-foreground">
          {plottable ? "No daily values" : "Daily values available in the table"}
        </span>
      )}
    </a>
  );
}
