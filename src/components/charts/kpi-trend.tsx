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
    <div className="mt-2 min-w-0">
      {plottable && present.length > 0 ? (
        <svg
          role="img"
          aria-label={`${label}: daily trend for the selected period. Missing days are gaps. Follow Daily values for the detail table.`}
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
        <p className="flex h-11 items-center text-xs text-muted-foreground">
          {plottable ? "No daily values" : "Daily values available in the table"}
        </p>
      )}
      <a
        href={tableHref}
        aria-label={`View daily values for ${label}`}
        className="mt-1 inline-flex min-h-6 items-center rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
      >
        Daily values
      </a>
    </div>
  );
}
