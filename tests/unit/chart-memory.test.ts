import { describe, expect, it } from "vitest";
import {
  CHART_MEMORY_MAX_ENTRIES,
  parseChartMemory,
  rememberChartMetric,
  serializeChartMemory,
} from "@/lib/chart-memory";

describe("chart memory cookie", () => {
  it("round-trips through the cookie, whether or not the server decoded it first", () => {
    const memory = rememberChartMetric(
      rememberChartMetric({}, "/overview:metric", "orders"),
      "/retention:rate_curve",
      "second",
    );
    const raw = serializeChartMemory(memory);
    expect(raw).not.toMatch(/[;,\s"]/);
    expect(parseChartMemory(raw)).toEqual(memory);
    // Next decodes cookie values once on the server; the browser reads them raw.
    expect(parseChartMemory(decodeURIComponent(raw))).toEqual(memory);
  });

  it("ignores malformed, oversized and missing values", () => {
    expect(parseChartMemory(undefined)).toEqual({});
    expect(parseChartMemory("%E0%A4%A")).toEqual({});
    expect(
      parseChartMemory(
        new URLSearchParams({
          "/overview:metric": "spend",
          "/x:metric": "<script>",
          "/y:metric": "a".repeat(65),
          "bad key": "orders",
          "/z:metric": "",
        }).toString(),
      ),
    ).toEqual({ "/overview:metric": "spend" });
  });

  it("moves a new choice to the end and drops the oldest past the cap", () => {
    let memory = {};
    for (let index = 0; index < CHART_MEMORY_MAX_ENTRIES; index += 1)
      memory = rememberChartMetric(memory, `/page${index}:metric`, "spend");
    memory = rememberChartMetric(memory, "/page0:metric", "orders");
    memory = rememberChartMetric(memory, "/new:metric", "roas");
    expect(Object.keys(memory)).toHaveLength(CHART_MEMORY_MAX_ENTRIES);
    expect(memory).not.toHaveProperty("/page1:metric");
    expect(Object.entries(memory).slice(-2)).toEqual([
      ["/page0:metric", "orders"],
      ["/new:metric", "roas"],
    ]);
    expect(Object.keys(parseChartMemory(serializeChartMemory({ ...memory, "/extra:metric": "x" })))).toHaveLength(
      CHART_MEMORY_MAX_ENTRIES,
    );
  });
});
