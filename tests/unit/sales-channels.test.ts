import { expect, it } from "vitest";
import {
  encodeSalesChannels,
  matchesSalesChannel,
  parseSalesChannel,
  salesChannelValues,
  summarySalesChannel,
} from "@/lib/filters";
it("keeps old one-channel links and canonical multi-selection including punctuation", () => {
  expect(parseSalesChannel({ sales_channel: "Online DTC" })).toBe("Online DTC");
  const selection = parseSalesChannel({ sales_channel: '["B & B","A, b","B & B"]' });
  expect(selection).toBe('["A, b","B & B"]');
  expect(matchesSalesChannel(selection, "A, b")).toBe(true);
  expect(matchesSalesChannel(selection, "other")).toBe(false);
  expect(matchesSalesChannel(null, "other")).toBe(true);
  expect(encodeSalesChannels([])).toBeNull();
  expect(summarySalesChannel({ sales_channel: "" })).toBeNull();
});
it.each(["[null]", "[]", "[1]", '["x",null]', "[" + "x".repeat(7000)])(
  "keeps an invalid choice explicit instead of widening: %s",
  (value) => {
    const parsed = parseSalesChannel({ sales_channel: value });
    expect(parsed).not.toBeNull();
    expect(salesChannelValues(parsed)).not.toHaveLength(0);
    expect(matchesSalesChannel(parsed, "Online DTC")).toBe(false);
  },
);
