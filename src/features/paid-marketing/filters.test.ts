import { expect, it } from "vitest";
import { paidMarketingOptions } from "./filters";

it("normalizes the report and export scope from one parse", () => {
  expect(paidMarketingOptions({})).toEqual({
    channel: null,
    grain: "day",
    breakdown: "channel",
    names: { rules: [], error: null },
  });
  expect(paidMarketingOptions({ channel: "x".repeat(150), grain: "week", breakdown: "tactic" })).toMatchObject({
    channel: "x".repeat(100),
    grain: "week",
    breakdown: "tactic",
  });
  expect(paidMarketingOptions({ breakdown: "unknown" }).breakdown).toBe("channel");
});
