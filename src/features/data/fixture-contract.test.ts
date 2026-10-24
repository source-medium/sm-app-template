import { expect, it } from "vitest";
import { sampleDefinitions } from "./sample";
import { DATA_SOURCES, PAGE_SIZE } from "./rows";
import { dependencyIds } from "@/lib/metric-binding";
it("ships bounded source choices and reviewed store-free definitions with an exact dependency closure", () => {
  const data = sampleDefinitions();
  const names = new Set(data.metrics.map((metric) => metric.metric_name));
  expect(data.mode).toBe("sample");
  expect(data.sources).toEqual([]);
  expect(PAGE_SIZE).toBe(20);
  expect(DATA_SOURCES.length).toBeLessThanOrEqual(12);
  for (const metric of data.metrics) {
    expect(metric).not.toHaveProperty("sm_store_id");
    for (const dependency of dependencyIds(metric.dependent_metrics)) expect(names.has(dependency)).toBe(true);
  }
});
