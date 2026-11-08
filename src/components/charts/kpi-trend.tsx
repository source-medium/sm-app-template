import { toChartNumber } from "@/lib/data/decode";

export type KpiTrendData = { values: readonly (number | bigint | null)[]; tableHref: string };

/** A server-rendered trend linked to its existing detail table, with no extra chart JavaScript. */
export function KpiTrend({ label, values: raw, tableHref }: KpiTrendData & { label: string }) {
  const values = raw.map((value) => (value === null ? null : toChartNumber(value)));
  const plottable = raw.every((value, index) => value === null || values[index] !== null);
  const present = values.filter((value): value is number => value !== null);
  // Normalize before finding the span, so large positive/negative finite values cannot overflow it.
  const scale = Math.max(1, ...present.map(Math.abs));
  const min = Math.min(...present) / scale;
  const max = Math.max(...present) / scale;
  const coordinates = values.map((value, index) =>
    value === null
      ? null
      : {
          x: values.length === 1 ? 100 : 2 + (index / (values.length - 1)) * 196,
          y: max === min ? 22 : 42 - ((value / scale - min) / (max - min)) * 40,
        },
  );
  const path = coordinates
    .map((point, index) => (point ? `${coordinates[index - 1] ? "L" : "M"}${point.x},${point.y}` : ""))
    .join(" ");
  return (
    <a
      href={tableHref}
      aria-label={`View daily values for ${label}`}
      title="View daily values"
      className="mt-2 block min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {plottable && present.length > 0 ? (
        <svg
          role="img"
          aria-label={`${label}: daily trend for the selected period. Missing days are gaps.`}
          viewBox="0 0 200 44"
          preserveAspectRatio="none"
          className="h-11 w-full text-chart-1"
        >
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {coordinates.map((point, index) =>
            point && !coordinates[index - 1] && !coordinates[index + 1] ? (
              <circle key={index} cx={point.x} cy={point.y} r="2" fill="currentColor" />
            ) : null,
          )}
        </svg>
      ) : (
        <span className="flex h-11 items-center text-xs text-muted-foreground">
          {plottable ? "No daily values" : "Daily values available in the table"}
        </span>
      )}
    </a>
  );
}
