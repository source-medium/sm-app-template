/**
 * How every chart draws a series as a line: the period solid, a comparison
 * period dashed. Plain SVG with no client code, so the server-rendered KPI
 * sparklines and the charts' legends share it.
 */

/** A comparison period's dash pattern, on chart lines, sparklines and their keys. */
export const COMPARISON_DASH = "5 3";

/** A short line in a series' color, dashed for a comparison period, beside its label. */
export function LineSwatch({ color, dashed = false }: { color?: string; dashed?: boolean }) {
  return (
    <span aria-hidden className="flex shrink-0">
      <svg viewBox="0 0 18 4" className="h-1 w-[18px]">
        <line
          x1="0"
          y1="2"
          x2="18"
          y2="2"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? COMPARISON_DASH : undefined}
        />
      </svg>
    </span>
  );
}
