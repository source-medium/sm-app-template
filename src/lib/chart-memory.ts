/**
 * Which measure each chart last showed, per browser. The server reads the
 * cookie, so a page whose URL names no measure (a sidebar or filter link, a new
 * visit, an untouched default) paints that measure immediately. Entries are keyed
 * `<pathname>:<param>` and only ever select from a chart's own fixed list.
 */
export const CHART_MEMORY_COOKIE = "sm-chart-metrics";
export const CHART_MEMORY_MAX_ENTRIES = 32;
export type ChartMemory = Record<string, string>;

const TOKEN = /^[\w/:.-]{1,64}$/;

/** Ignores anything malformed; keeps the most recent entries when over the cap. */
export function parseChartMemory(value: string | undefined): ChartMemory {
  const entries = [...new URLSearchParams(value ?? "")].filter(
    ([key, metric]) => TOKEN.test(key) && TOKEN.test(metric),
  );
  return Object.fromEntries(entries.slice(-CHART_MEMORY_MAX_ENTRIES));
}

/** Records a choice as the newest entry, dropping the oldest beyond the cap. */
export function rememberChartMetric(memory: ChartMemory, key: string, metric: string): ChartMemory {
  const others = Object.entries(memory).filter(([entry]) => entry !== key);
  return Object.fromEntries([...others, [key, metric]].slice(-CHART_MEMORY_MAX_ENTRIES));
}

export function serializeChartMemory(memory: ChartMemory): string {
  return new URLSearchParams(memory).toString();
}
