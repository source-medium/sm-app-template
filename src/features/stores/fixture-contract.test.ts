import { expect, it } from "vitest";
import { SAMPLE_STORES } from "@/lib/sample/stores";
import { sampleSummarySource } from "@/lib/sample/executive-summary";
import { toUnits } from "@/lib/data/decimal";
import { periodChanges } from "@/lib/comparison";
import { VALID_SALES_CHANNELS } from "@/lib/sales-channels";
import { sampleStoreComparison } from "./sample";

const range = { from: "2026-09-01", to: "2026-09-07" };
const baseline = { from: "2026-08-25", to: "2026-08-31" };
it("aggregates each store and period independently with exact money and fractional order measures", () => {
  const result = sampleStoreComparison([...SAMPLE_STORES], range, baseline, "2026-10-01");
  expect(result).toHaveLength(2);
  for (const row of result) {
    for (const [prefix, period] of [
      ["", range],
      ["previous_", baseline],
    ] as const) {
      const rows = sampleSummarySource(row.sm_store_id, period, "2026-10-01");
      // Stores opens on the summary default, so published non-valid rows stay out of each total.
      expect(rows.some((value) => !VALID_SALES_CHANNELS.includes(value.sm_channel) && value.order_count > 0)).toBe(
        true,
      );
      const source = rows.filter((value) => VALID_SALES_CHANNELS.includes(value.sm_channel));
      expect(toUnits(row[`${prefix}revenue`] ?? "0")).toBe(
        source.reduce((total, value) => total + value.order_net_revenue_cents, 0n) * 10_000_000n,
      );
      expect(row[`${prefix}orders`]).toBe(source.reduce((total, value) => total + value.order_count, 0));
    }
  }
  expect(result[0]?.revenue).not.toBe(result[1]?.revenue);
});
it("keeps missing values null and disables comparisons when off", () => {
  const rows = sampleStoreComparison(
    [{ id: "no-rows", label: "No rows", domain: null, logoUrl: null, brand: null, timeZone: null, currency: null }],
    range,
    null,
    "2026-10-01",
  );
  expect(rows[0]).toMatchObject({
    revenue: null,
    orders: null,
    spend: null,
    latest_date: null,
    previous_revenue: null,
  });
  expect(periodChanges(range, null, rows[0]).show).toBe(false);
});
it("evaluates coverage per store, never borrowing another store's later date", () => {
  expect(periodChanges(range, baseline, { latest_date: "2026-09-06", previous_latest_date: "2026-08-31" }).show).toBe(
    false,
  );
  expect(periodChanges(range, baseline, { latest_date: "2026-09-07", previous_latest_date: "2026-08-31" }).show).toBe(
    true,
  );
});
