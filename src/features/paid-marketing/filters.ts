import { parseAdNameFilters } from "@/lib/ad-name-filters";
import { adPlatformKey } from "@/lib/ad-platforms";
import { parseChoice, single, type SearchParams } from "@/lib/filters";
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
  const channel = single(params, "channel")?.slice(0, 100);
  return {
    channel: channel ? adPlatformKey(channel) : null,
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
