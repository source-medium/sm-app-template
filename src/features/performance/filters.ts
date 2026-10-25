import { parseChoice, single, summarySalesChannel, type SearchParams } from "@/lib/filters";
import { parseTimeGrain } from "@/lib/time-grain";

/** Applied data options shared by the report and its CSV; metric groups only change presentation. */
export function performanceOptions(params: SearchParams) {
  return {
    view: parseChoice(params, "view", ["business", "platforms"], "business"),
    grain: parseTimeGrain(params),
    channel: summarySalesChannel(params),
    // One platform's detail, or the combined platforms when empty.
    platform: single(params, "platform")?.slice(0, 200) ?? "",
  };
}
