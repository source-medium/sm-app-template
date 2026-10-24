import { expect, it } from "vitest";
import {
  defaultSalesChannel,
  encodeSalesChannels,
  salesChannelLabel,
  salesChannelReset,
  summarySalesChannel,
} from "@/lib/filters";
import { VALID_SALES_CHANNELS } from "@/lib/sales-channels";

const VALID = encodeSalesChannels(VALID_SALES_CHANNELS);

it("opens summary reports on SourceMedium's valid channels and keeps every-row totals an explicit choice", () => {
  expect(defaultSalesChannel()).toBe(VALID);
  expect(summarySalesChannel({})).toBe(VALID);
  // An empty URL value is the deliberate all-rows choice; the default never silently reapplies.
  expect(summarySalesChannel({ sales_channel: "" })).toBeNull();
  expect(salesChannelLabel(VALID)).toBe("Valid sales channels");
  expect(salesChannelLabel(null)).toBe("All channels, including non-valid");
  expect(salesChannelLabel('["online_dtc","amazon"]')).toBe("amazon, online_dtc");
  expect(salesChannelLabel("online_dtc")).toBe("online_dtc");
});

it("resets an empty selection to the default, widens the default, and offers nothing past every row", () => {
  const params = { store: "s1", sales_channel: "unknown" };
  expect(salesChannelReset("/overview", params, "unknown")).toEqual({
    href: "/overview?store=s1",
    label: "Reset sales channels",
  });
  expect(salesChannelReset("/overview", { store: "s1" }, VALID)).toEqual({
    href: "/overview?store=s1&sales_channel=",
    label: "Show all channels, including non-valid",
  });
  expect(salesChannelReset("/overview", { store: "s1", sales_channel: "" }, null)).toBeUndefined();
});
