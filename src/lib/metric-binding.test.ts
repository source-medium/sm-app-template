import { expect, it } from "vitest";
import { dependencyIds, metricCompatibility, type MetricBinding, type PublishedMetric } from "./metric-binding";
import { sourceEvidence } from "./data/evidence";
const metric: PublishedMetric = {
  metric_name: "revenue",
  metric_label: "Revenue",
  metric_description: null,
  calculation: "SUM(net)",
  has_filter: false,
  filter_condition: null,
  dependent_metrics: null,
  underlying_model: "summary",
  metric_time_expression: "date",
  metric_time_grains: "day",
  value_format: "currency",
};
const binding: MetricBinding = {
  id: "revenue",
  label: "Revenue",
  canonical: metric,
  calculation: "SUM(net)",
  source: "summary",
  fields: ["net"],
  population: "Summary",
  grain: "day",
  dateBasis: "date",
  attribution: "Summary",
  format: "currency",
};
it("does not match dependencies by a similar name and finds cycles", () => {
  expect(dependencyIds("revenue, revenue_net,revenue")).toEqual(["revenue", "revenue_net"]);
  expect(metricCompatibility(binding, [{ ...metric, dependent_metrics: "revenue_net" }])).toContain(
    "Published definition unavailable: revenue_net.",
  );
  expect(metricCompatibility(binding, [{ ...metric, dependent_metrics: "revenue" }])).toContain(
    "Dependency cycle at revenue.",
  );
});
it("detects population, time, formula and unit drift without changing report definitions", () => {
  expect(metricCompatibility(binding, [metric])).toEqual([]);
  expect(
    metricCompatibility(binding, [
      {
        ...metric,
        has_filter: true,
        filter_condition: "valid",
        metric_time_expression: "created",
        calculation: "AVG(net)",
        value_format: "count",
      },
    ]),
  ).toHaveLength(5);
  expect(metricCompatibility(binding, [{ ...metric, value_format: null }])).toEqual([]);
  // A live catalog folds YAML line breaks and may reword prose; neither is a definition change.
  expect(
    metricCompatibility(binding, [
      { ...metric, metric_description: "Reworded prose.", calculation: "SUM(net) ", metric_time_grains: "day " },
    ]),
  ).toEqual([]);
  expect(metricCompatibility({ ...binding, canonical: undefined }, [])).toEqual([]);
  expect(metricCompatibility(binding, [metric, metric])).toContain("Conflicting published definitions: revenue.");
});
it("keeps dataset, store, global scope, repeated statistics and conflicts separate", () => {
  const row = {
    dataset: "a",
    relation: "orders",
    storeId: "s",
    hasData: true,
    recentRecord: true,
    observedDate: "2026-10-22",
  };
  const result = sourceEvidence("a", "orders", "s", [row, row, { ...row, dataset: "b", observedDate: "2020-01-01" }]);
  expect(result).toMatchObject({
    scope: "store",
    consistency: "consistent",
    observedDate: "2026-10-22",
    freshness: "unknown",
    completeness: "unknown",
    quality: "unknown",
  });
  expect(sourceEvidence("a", "orders", "s", [{ ...row, storeId: null }])).toMatchObject({
    scope: "global",
    observedDate: null,
  });
  expect(sourceEvidence("a", "orders", "s", [{ ...row, storeId: "other" }])).toMatchObject({
    scope: "unknown",
    observedDate: null,
  });
  expect(sourceEvidence("a", "orders", "s", [row, { ...row, recentRecord: false }])).toMatchObject({
    consistency: "inconsistent",
    observedDate: null,
  });
});
