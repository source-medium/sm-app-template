import { z } from "zod";
import { bq, decodeRows } from "@/lib/data/decode";
export const ATTRIBUTION_RELATION = "fct_order_attribution_signals";
export const MAX_SIGNALS = 100;
const AttributionRow = z.object({
  evidence_type: bq.string().nullable(),
  evidence_source: bq.string().nullable(),
  sm_marketing_channel: bq.string().nullable(),
  sm_utm_source: bq.string().nullable(),
  sm_utm_medium: bq.string().nullable(),
  sm_attribution_inference_method: bq.string().nullable(),
  sm_utm_final_source_priority: bq.int64().nullable(),
  winner_count: bq.int64(),
  signal_count: bq.int64(),
});
export type AttributionSignal = z.output<typeof AttributionRow>;
export type OrderAttribution = { signals: AttributionSignal[]; truncated: boolean; winnerCount: bigint };
export function toOrderAttribution(rows: readonly unknown[], truncated: boolean): OrderAttribution {
  const signals = decodeRows(AttributionRow, rows, ATTRIBUTION_RELATION);
  const winnerCounts = new Set(signals.map((row) => row.winner_count));
  if (winnerCounts.size > 1) throw new Error("Conflicting attribution winner counts");
  return { signals, truncated, winnerCount: signals[0]?.winner_count ?? 0n };
}
/** Categories describe published evidence. They never assign or recompute credit. */
export function signalGroup(row: AttributionSignal): string {
  if (row.sm_utm_final_source_priority === 1n) return "Published primary winner";
  if (row.sm_utm_final_source_priority !== null) return "Lower-priority traffic evidence";
  if (row.evidence_source === "mta_first_touch" || row.evidence_source === "mta_last_touch")
    return "Contextual MTA evidence";
  if (row.evidence_type === "zero_party_candidate") return "Contextual survey / zero-party evidence";
  if (row.evidence_type === "order_discount_code") return "Contextual discount-code evidence";
  return "Unranked supporting evidence";
}
