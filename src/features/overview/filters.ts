import { summarySalesChannel, type SearchParams } from "@/lib/filters";
import { parseTimeGrain } from "@/lib/time-grain";

/** Applied data options shared by the report, CSV and JSON; trend modes only change presentation. */
export function overviewOptions(params: SearchParams) {
  return { channel: summarySalesChannel(params), grain: parseTimeGrain(params) };
}
