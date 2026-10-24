import { expect, it } from "vitest";
import definitions from "../../../contracts/dashboard-metrics-v1/definitions.json";
import { metricCompatibility } from "@/lib/metric-binding";
import { VALID_SALES_CHANNEL_SQL } from "@/lib/data/channel-sql";
import { overviewBindings } from "./metrics";
it("keeps summary populations distinct from valid-order metrics and reviews every published dependency", () => {
  for (const binding of overviewBindings) expect(metricCompatibility(binding, definitions.metrics)).toEqual([]);
  for (const binding of overviewBindings.filter((binding) => "canonical" in binding)) {
    if (!("canonical" in binding)) throw new Error("Expected canonical binding");
    expect(binding.canonical.underlying_model).toBe("rpt_executive_summary_daily");
    // Order measures carry the catalog's valid-channel filter; spend, sessions and the MER ratio do not.
    expect(binding.canonical.has_filter).toBe(["revenue", "orders"].includes(binding.id));
    expect(binding.canonical.metric_time_expression).toBe("date");
  }
  expect(overviewBindings.find((binding) => binding.id === "average")).not.toHaveProperty("canonical");
  expect(overviewBindings.find((binding) => binding.id === "orders")?.calculation).toBe(
    `SUM(IF(${VALID_SALES_CHANNEL_SQL}, order_count, 0))`,
  );
  expect(overviewBindings.find((binding) => binding.id === "mer")?.calculation).toBe(
    `SUM(IF(${VALID_SALES_CHANNEL_SQL}, order_net_revenue, 0)) / SUM(ad_spend)`,
  );
});
