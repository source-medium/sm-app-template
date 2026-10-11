import { z } from "zod";
import { bq } from "@/lib/data/decode";
import { periodCoverageFields } from "@/lib/data/period-sql";

export const STORES_RELATION = "rpt_executive_summary_daily";
export const StoreSummaryRow = z.object({
  sm_store_id: bq.string(),
  revenue: bq.numeric().nullable(),
  previous_revenue: bq.numeric().nullable(),
  orders: bq.float64().nullable(),
  previous_orders: bq.float64().nullable(),
  spend: bq.numeric().nullable(),
  previous_spend: bq.numeric().nullable(),
  ...periodCoverageFields,
});
export type StoreSummary = z.infer<typeof StoreSummaryRow>;
