import { expect, it } from "vitest";
import definitions from "../../../contracts/dashboard-metrics-v1/definitions.json";
import { metricCompatibility } from "@/lib/metric-binding";
import { geographyBindings } from "./metrics";
it("canonical validity and processed fallback match; created dates are explicitly report-specific", () => {
  for (const binding of geographyBindings("processed")) {
    expect(metricCompatibility(binding, definitions.metrics)).toEqual([]);
    expect(binding.canonical?.underlying_model).toBe("obt_orders");
    expect(binding.canonical?.filter_condition).toBe("is_order_sm_valid");
    expect(binding.canonical?.has_filter).toBe(true);
    expect(binding.canonical?.metric_time_expression?.replaceAll(" ", "").toLowerCase()).toBe(
      binding.dateBasis.replaceAll(" ", "").toLowerCase(),
    );
  }
  expect(geographyBindings("created").every((binding) => !binding.canonical)).toBe(true);
  expect(geographyBindings("processed")[1]?.calculation).toBe("COUNT(sm_order_key) WHERE is_order_sm_valid = TRUE");
});
