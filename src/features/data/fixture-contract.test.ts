import { expect, it } from "vitest";
import { sampleDefinitions } from "./sample";
import { DATA_SOURCES } from "./rows";
import { dependencyIds } from "@/lib/metric-binding";
import { explorerCatalog, firstSentence, matchesSearch, metricCategory } from "./catalog";
it("ships bounded source choices and reviewed store-free definitions with an exact dependency closure", () => {
  const data = sampleDefinitions();
  const names = new Set(data.metrics.map((metric) => metric.metric_name));
  expect(data.mode).toBe("sample");
  expect(data.sources).toEqual([]);
  expect(DATA_SOURCES.length).toBeLessThanOrEqual(12);
  for (const metric of data.metrics) {
    expect(metric).not.toHaveProperty("sm_store_id");
    for (const dependency of dependencyIds(metric.dependent_metrics)) expect(names.has(dependency)).toBe(true);
  }
});

it("folds alias rows into their primary metric, groups by the published category or model, and searches aliases", () => {
  const base = sampleDefinitions().metrics[0];
  if (!base) throw new Error("Expected a bundled definition");
  const primary = {
    ...base,
    metric_name: "average_order_value_net",
    metric_label: "Average order value",
    abbreviations_list: "aov, aov_net",
  };
  const alias = {
    ...base,
    metric_name: "aov",
    metric_label: "AOV",
    is_abbreviation: true,
    preferred_metric_name: "average_order_value_net",
  };
  const categorized = { ...base, metric_name: "x", metric_category: "Revenue" };
  const { metrics, conflicts } = explorerCatalog([alias, primary, categorized]);
  expect(conflicts).toEqual([]);
  expect(metrics.map((metric) => metric.metric_name)).toEqual(["average_order_value_net", "x"]);
  expect(metrics[0]?.aliases).toEqual(["aov", "aov_net"]);
  expect(metrics[1]?.category).toBe("Revenue");
  expect(metrics[0]?.category).toBe(base.underlying_model);
  const found = metrics.find((metric) => matchesSearch(metric, "AOV"));
  expect(found?.metric_name).toBe("average_order_value_net");
  expect(metrics.some((metric) => matchesSearch(metric, "no such"))).toBe(false);
  expect(metricCategory({ ...base, metric_category: "period_comparison" })).toBe("Period comparison");
  expect(metricCategory({ ...base, metric_category: " revenue " })).toBe("Revenue");
  expect(firstSentence("First sentence. Second one.")).toBe("First sentence.");
  expect(firstSentence(null)).toBe("No published description.");
});

it("sets aside names published with conflicting definitions and keeps an alias whose primary is not loaded", () => {
  const base = sampleDefinitions().metrics[0];
  if (!base) throw new Error("Expected a bundled definition");
  const first = { ...base, metric_name: "net_revenue", calculation: "a" };
  const second = { ...base, metric_name: "net_revenue", calculation: "b" };
  const orphan = { ...base, metric_name: "nr", is_abbreviation: true, preferred_metric_name: "missing_primary" };
  const { metrics, conflicts } = explorerCatalog([first, second, orphan]);
  expect(conflicts).toEqual(["net_revenue"]);
  expect(metrics.map((metric) => metric.metric_name)).toEqual(["nr"]);
});
