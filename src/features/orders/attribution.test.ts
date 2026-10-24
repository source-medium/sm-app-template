import { expect, it } from "vitest";
import { signalGroup, toOrderAttribution } from "./attribution";
const row = {
  evidence_type: "traffic_source_candidate",
  evidence_source: "shopify_landing_site",
  sm_marketing_channel: "Paid Social",
  sm_utm_source: "meta",
  sm_utm_medium: "paid_social",
  sm_attribution_inference_method: "raw_utm",
  sm_utm_final_source_priority: "1",
  winner_count: "1",
  signal_count: "1",
};
it("distinguishes primary rank, lower priority and context without inventing credit", () => {
  const data = toOrderAttribution([row], false);
  const signal = data.signals[0];
  if (!signal) throw new Error("Expected signal fixture");
  expect(data.winnerCount).toBe(1n);
  expect(signalGroup(signal)).toBe("Published primary winner");
  expect(signalGroup({ ...signal, sm_utm_final_source_priority: 8n })).toBe("Lower-priority traffic evidence");
  expect(signalGroup({ ...signal, sm_utm_final_source_priority: null, evidence_source: "mta_last_touch" })).toBe(
    "Contextual MTA evidence",
  );
  expect(signalGroup({ ...signal, sm_utm_final_source_priority: null, evidence_type: "zero_party_candidate" })).toBe(
    "Contextual survey / zero-party evidence",
  );
  expect(signalGroup({ ...signal, sm_utm_final_source_priority: null, evidence_type: "order_discount_code" })).toBe(
    "Contextual discount-code evidence",
  );
});
it("retains empty, duplicate-winner and truncation states", () => {
  expect(toOrderAttribution([], false)).toMatchObject({ winnerCount: 0n, signals: [] });
  expect(toOrderAttribution([{ ...row, winner_count: "2", signal_count: "101" }], true)).toMatchObject({
    winnerCount: 2n,
    truncated: true,
  });
  expect(() => toOrderAttribution([row, { ...row, winner_count: "2" }], false)).toThrow("Conflicting attribution");
});
