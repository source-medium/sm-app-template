import { expect, it } from "vitest";
import definitions from "../../../contracts/dashboard-metrics-v1/definitions.json";
import { dependencyIds, metricCompatibility } from "@/lib/metric-binding";
import { creativeBindings, creativeBinding } from "./metrics";
it("binds platform aggregates to the ad source while disclosing the creative population restriction", () => {
  for (const binding of creativeBindings) {
    expect(metricCompatibility(binding, definitions.metrics)).toEqual([]);
    expect(binding.canonical?.underlying_model).toBe("rpt_ad_performance_daily");
    expect(binding.canonical?.metric_time_expression).toBe("date");
    expect(binding.population).toContain("creative identity");
    expect(binding.attribution).toContain("unverified");
  }
  expect(dependencyIds(creativeBinding("roas").canonical?.dependent_metrics ?? null)).toEqual([
    "platform_reported_revenue",
    "total_ad_spend",
  ]);
  expect(creativeBinding("conversions").fields).toEqual(["ad_platform_reported_conversions"]);
  expect(creativeBinding("cpo").calculation).toBe("SUM(ad_spend) / SUM(ad_platform_reported_conversions)");
});
