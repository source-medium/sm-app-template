import { summarySalesChannel, type SearchParams } from "@/lib/filters";
import { parseTimeGrain } from "@/lib/time-grain";

/** Presentation only: `all` shows every trend instead of the selected one, without a request. */
export const SHOW_TRENDS_PARAM = "show_trends";

/** Applied data options shared by the report, CSV and JSON; trend modes only change presentation. */
export function overviewOptions(params: SearchParams) {
  return { channel: summarySalesChannel(params), grain: parseTimeGrain(params) };
}
