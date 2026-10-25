import definitions from "../../contracts/dashboard-metrics-v1/definitions.json";
import type { PublishedMetric } from "./metric-binding";

/** SourceMedium's reviewed metric definitions (contracts/dashboard-metrics-v1), which views bind their measures to. */
export const REVIEWED_METRICS: readonly PublishedMetric[] = definitions.metrics;

/** The reviewed definition named `name`. A binding to a metric the contract does not define fails when its view loads. */
export function reviewedMetric(name: string): PublishedMetric {
  const metric = REVIEWED_METRICS.find((row) => row.metric_name === name);
  if (!metric) throw new Error(`Missing reviewed metric ${name}`);
  return metric;
}
