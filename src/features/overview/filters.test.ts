import { expect, it } from "vitest";
import { appConfig } from "@/app.config";
import { overviewOptions } from "./filters";

it("keeps configured channel defaults distinct from an explicit all-channel choice", () => {
  const original = appConfig.defaultSalesChannels;
  appConfig.defaultSalesChannels = ["amazon"];
  try {
    expect(overviewOptions({})).toEqual({ channel: "amazon", grain: "day" });
    expect(overviewOptions({ sales_channel: "", grain: "invalid" })).toEqual({ channel: null, grain: "day" });
  } finally {
    appConfig.defaultSalesChannels = original;
  }
});

it("normalizes channel lists without broadening unknown or malformed selections", () => {
  expect(overviewOptions({ sales_channel: '["online_dtc","amazon"]', grain: ["week", "day"] })).toEqual({
    channel: '["amazon","online_dtc"]',
    grain: "week",
  });
  expect(overviewOptions({ sales_channel: "unknown" }).channel).toBe("unknown");
  expect(overviewOptions({ sales_channel: "[null]" }).channel).not.toBeNull();
});
