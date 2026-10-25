import { z } from "zod";
import { bq } from "@/lib/data/decode";
import { periodCoverageFields, periodFields } from "@/lib/data/period-sql";

export const STORES_RELATION = "rpt_executive_summary_daily";
export const StoreSummaryRow = z.object({
  sm_store_id: bq.string(),
  ...periodFields(["revenue", "spend"], bq.numeric().nullable()),
  ...periodFields(["orders"], bq.float64().nullable()),
  ...periodCoverageFields,
});
export type StoreSummary = z.infer<typeof StoreSummaryRow>;
