/**
 * Axis ticks in the browser without locale APIs, so server and client render
 * identical text: 950, 1.2K, 12.5K, 1.25M. Up to three significant digits, so
 * every nice step valueTicks() picks reads exactly. Values shown to people
 * elsewhere are formatted on the server.
 */
export function compactNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (magnitude >= size) return `${sign}${trim(magnitude / size)}${suffix}`;
  }
  return `${sign}${trim(magnitude)}`;
}

function trim(value: number): string {
  return String(value >= 100 ? Math.round(value) : Number(value.toPrecision(3)));
}

/** A money axis's currency symbol and the side it sits on, worked out on the server (`moneyAxis` in lib/format). */
export type MoneyAxis = { prefix: string; suffix: string };

/** How a value axis labels its ticks; labels and tooltips still arrive formatted by the server. */
export type AxisFormat = "number" | "percent" | MoneyAxis;

/** Room each value label needs on an axis, so a narrow plot draws fewer, wider steps. */
const VALUE_TICK_PX = 64;

/**
 * How many steps a value axis aims for across a plot `width` pixels wide:
 * one per label's room, from two to five; five before the plot is measured.
 */
export function tickTarget(width: number | undefined): number {
  return width ? Math.max(2, Math.min(5, Math.floor(width / VALUE_TICK_PX))) : 5;
}

/** One axis tick: 1.2K, 45%, or $12K with the report's currency symbol on its side. */
export function axisTick(value: number, format: AxisFormat = "number"): string {
  if (format === "percent") return `${compactNumber(value * 100)}%`;
  if (format === "number") return compactNumber(value);
  return `${value < 0 ? "-" : ""}${format.prefix}${compactNumber(Math.abs(value))}${format.suffix}`;
}

/**
 * Evenly spaced value-axis ticks on a 1, 2, 2.5 or 5 step, from zero (or the
 * lowest value, when one is negative) to the first step at or past the largest
 * value, so the axis ends near its longest bar rather than a whole step beyond.
 */
export function valueTicks(values: number[], target = 5): number[] {
  const finite = values.filter(Number.isFinite);
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  if (high === low) return [0];
  const raw = (high - low) / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  // A 2.5 step only from 25 up, so a small count axis never shows a fractional tick.
  const multiples = power >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  const step = multiples.map((multiple) => multiple * power).find((candidate) => candidate >= raw) ?? raw;
  const ticks: number[] = [];
  for (let tick = Math.floor(low / step) * step; tick < high + step; tick += step) {
    ticks.push(Number(tick.toPrecision(12)));
    if (tick >= high) break;
  }
  return ticks;
}
