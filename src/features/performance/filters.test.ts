import { expect, it } from "vitest";
import { appConfig } from "@/app.config";
import { performanceOptions } from "./filters";

it("distinguishes an omitted channel from an explicit all-channel choice", () => {
  const original = appConfig.defaultSalesChannels;
  appConfig.defaultSalesChannels = ["amazon"];
  try {
    expect(performanceOptions({})).toEqual({ view: "business", grain: "day", channel: "amazon", platform: "" });
    expect(performanceOptions({ sales_channel: "" }).channel).toBeNull();
  } finally {
    appConfig.defaultSalesChannels = original;
  }
});

it("normalizes report choices while retaining explicit unknown channels and platforms", () => {
  expect(
    performanceOptions({ view: "invalid", grain: "invalid", sales_channel: "unknown", platform: "unknown" }),
  ).toEqual({ view: "business", grain: "day", channel: "unknown", platform: "unknown" });
  expect(
    performanceOptions({
      view: ["platforms", "business"],
      grain: ["month", "day"],
      platform: ["Meta", "Google"],
      sales_channel: '["online_dtc","amazon"]',
    }),
  ).toEqual({ view: "platforms", grain: "month", channel: '["amazon","online_dtc"]', platform: "Meta" });
  expect(performanceOptions({ sales_channel: "[null]" }).channel).not.toBeNull();
  expect(performanceOptions({ platform: "x".repeat(201) }).platform).toHaveLength(200);
});
