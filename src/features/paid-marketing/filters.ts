import { parseAdNameFilters } from "@/lib/ad-name-filters";
import { parseAdPlatform, parseChoice, type SearchParams } from "@/lib/filters";
import { parseTimeGrain } from "@/lib/time-grain";

export const BREAKDOWN_DIMENSIONS = [
  { value: "channel", label: "Ad platform" },
  { value: "campaign", label: "Campaign" },
  { value: "type", label: "Campaign type" },
  { value: "tactic", label: "Campaign tactic" },
] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number]["value"];

/** Applied data options shared by the report and its CSV; the chart measure only changes presentation. */
export function paidMarketingOptions(params: SearchParams) {
  return {
    channel: parseAdPlatform(params, "channel"),
    grain: parseTimeGrain(params),
    breakdown: parseChoice(
      params,
      "breakdown",
      BREAKDOWN_DIMENSIONS.map((item) => item.value),
      "channel",
    ),
    names: parseAdNameFilters(params),
  };
}
