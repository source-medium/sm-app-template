/**
 * Overview's sample and live paths share one row schema and one aggregation
 * contract. These cases check shape (the schema) and arithmetic (totals
 * computed independently of the code under test).
 */
import { describe, expect, it } from "vitest";
import { decodeRows, toChartNumber } from "@/lib/data/decode";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { datesInRange } from "@/lib/filters";
import { OVERVIEW_RELATION, OverviewRow, toOverviewData } from "./rows";
import { aggregateOverviewWire, sampleOverview, sampleOverviewSource, type OverviewSourceRow } from "./sample";
import { overviewSummaryRows } from "./summary-rows";

const RANGE = { from: "2026-09-01", to: "2026-09-28" };
const TODAY = "2026-10-05";

function source(
  date: string,
  orders: number,
  sessions: bigint,
  clicks: bigint,
  store = "s1",
  sub = "Paid",
  revenueCents = 0n,
  spendCents = 0n,
): OverviewSourceRow {
  return {
    sm_store_id: store,
    sm_channel: "Online DTC",
    sm_sub_channel: sub,
    date,
    order_net_revenue_cents: revenueCents,
    order_count: orders,
    website_sessions: sessions,
    ad_clicks: clicks,
    ad_spend_cents: spendCents,
    new_customer_order_net_revenue_cents: null,
    new_customer_order_count: null,
    repeat_customer_order_net_revenue_cents: null,
    repeat_customer_order_count: null,
  };
}

describe("overview fixture contract", () => {
  it.each(["missing-store", "constructor", "__proto__"])(
    "does not generate spend, clicks, or totals for %s",
    async (storeId) => {
      expect(sampleOverviewSource(storeId, RANGE, "2026-10-05")).toEqual([]);
      expect(await sampleOverview({ storeId, range: RANGE }, TODAY)).toEqual({
        days: [],
        summaries: [],
        totals: null,
        purchases: null,
      });
    },
  );
  it("summarizes only the selected sales channel, keeps exact amounts, and marks clipped period dates in exports", () => {
    const range = { from: "2026-09-02", to: "2026-09-08" };
    const rows = [
      source("2026-09-01", 99, 1n, 1n, "s1", "Paid", 99999n),
      source("2026-09-02", 1.5, 10n, 1n, "s1", "Paid", 10n, 1n),
      source("2026-09-06", 2, 20n, 2n, "s1", "Email", 20n, 2n),
      source("2026-09-08", 3, 30n, 3n, "s1", "Paid", 30n, 3n),
      { ...source("2026-09-02", 100, 100n, 100n, "s1", "Other", 99999n), sm_channel: "Amazon" },
    ];
    const data = toOverviewData(
      decodeRows(OverviewRow, aggregateOverviewWire(rows, "s1", range, "week", "Online DTC"), OVERVIEW_RELATION),
    );
    expect(data.summaries.map((row) => [row.date, row.netRevenue, row.orders, row.sessions])).toEqual([
      ["2026-08-31", "0.3", 3.5, 30n],
      ["2026-09-07", "0.3", 3, 30n],
    ]);
    expect(data.totals?.netRevenue).toBe("0.6");
    expect(data.days).toHaveLength(3);
    const exported = overviewSummaryRows(data, { storeId: "s1", range, grain: "week" });
    expect(exported.map((row) => [row.rowType, row.from, row.to, row.netRevenue])).toEqual([
      ["period", "2026-09-02", "2026-09-06", "0.3"],
      ["period", "2026-09-07", "2026-09-08", "0.3"],
      ["total", "2026-09-02", "2026-09-08", "0.6"],
    ]);
    const monthly = toOverviewData(
      decodeRows(OverviewRow, aggregateOverviewWire(rows, "s1", range, "month", "Online DTC"), OVERVIEW_RELATION),
    );
    expect(monthly.summaries).toHaveLength(1);
    expect(monthly.summaries[0]?.netRevenue).toBe("0.6");
    expect(
      toOverviewData(
        decodeRows(OverviewRow, aggregateOverviewWire(rows, "s1", range, "day", "Unknown"), OVERVIEW_RELATION),
      ).totals,
    ).toBeNull();
  });
  it("every generated row decodes through the live row schema", () => {
    for (const store of ["sample-store-a", "sample-store-b"]) {
      const wire = aggregateOverviewWire(sampleOverviewSource(store, RANGE, "2026-10-05"), store, RANGE);
      expect(wire.length).toBeGreaterThan(0);
      expect(() => decodeRows(OverviewRow, wire, OVERVIEW_RELATION)).not.toThrow();
    }
  });

  it("sums sub-channels by date and totals the period exactly, with fractional orders and exact money", () => {
    const rows = [
      source("2026-09-01", 1.5, 10n, 3n, "s1", "Paid", 10_01n, 3_33n),
      source("2026-09-01", 2.5, 5n, 0n, "s1", "Email", 20_02n, 0n),
      source("2026-09-02", 4, 7n, 1n, "s1", "Paid", 30_03n, 1_10n),
    ];
    const data = toOverviewData(decodeRows(OverviewRow, aggregateOverviewWire(rows, "s1", RANGE), OVERVIEW_RELATION));
    expect(data.days).toEqual([
      { date: "2026-09-01", netRevenue: "30.03", orders: 4, sessions: 15n, adClicks: 3n, adSpend: "3.33" },
      { date: "2026-09-02", netRevenue: "30.03", orders: 4, sessions: 7n, adClicks: 1n, adSpend: "1.1" },
    ]);
    expect(data.totals).toEqual({ netRevenue: "60.06", orders: 8, sessions: 22n, adClicks: 4n, adSpend: "4.43" });
  });

  it("keeps stores apart: there is no combined total", () => {
    const rows = [source("2026-09-01", 1, 1n, 1n, "s1"), source("2026-09-01", 100, 100n, 100n, "s2")];
    const data = toOverviewData(decodeRows(OverviewRow, aggregateOverviewWire(rows, "s1", RANGE), OVERVIEW_RELATION));
    expect(data.totals).toEqual({ netRevenue: "0", orders: 1, sessions: 1n, adClicks: 1n, adSpend: "0" });
  });

  it("keeps large INT64 values exact and refuses to chart them", () => {
    const huge = 9_007_199_254_740_993n; // 2^53 + 1
    const rows = [source("2026-09-01", 1, huge, 0n)];
    const data = toOverviewData(decodeRows(OverviewRow, aggregateOverviewWire(rows, "s1", RANGE), OVERVIEW_RELATION));
    expect(data.days[0]?.sessions).toBe(huge);
    expect(toChartNumber(huge)).toBeNull();
  });

  it("leaves missing dates as gaps, not zeros", () => {
    const store = "sample-store-b";
    const range = { from: "2026-06-01", to: "2026-08-29" };
    const dates = new Set(
      aggregateOverviewWire(sampleOverviewSource(store, range, "2026-10-05"), store, range).map((row) => row.date),
    );
    const all = datesInRange(range);
    expect(dates.size).toBeLessThan(all.length);
    expect(dates.size).toBeGreaterThan(all.length / 2);
  });

  it("returns no days and no totals for an empty range", () => {
    const data = toOverviewData(decodeRows(OverviewRow, aggregateOverviewWire([], "s1", RANGE), OVERVIEW_RELATION));
    expect(data).toEqual({ days: [], summaries: [], totals: null, purchases: null });
  });

  it("models forward-dated target rows with zero actuals, as the relation does", () => {
    const future = sampleOverviewSource("sample-store-a", { from: "2026-10-06", to: "2026-10-08" }, "2026-10-05");
    expect(future.length).toBeGreaterThan(0);
    for (const row of future) {
      expect([
        row.order_count,
        row.website_sessions,
        row.ad_clicks,
        row.order_net_revenue_cents,
        row.ad_spend_cents,
      ]).toEqual([0, 0n, 0n, 0n, 0n]);
    }
  });

  it("is deterministic: the same filters give the same numbers at any time", async () => {
    const filters = { storeId: "sample-store-a", range: RANGE };
    const first = await sampleOverview(filters, TODAY);
    const later = await sampleOverview(filters, "2027-01-01");
    expect(later).toEqual(first);
  });

  it("sums published purchase measures exactly within store, dates and channel, without inventing a remainder", () => {
    const first = {
      ...source("2026-09-01", 100, 1n, 1n),
      new_customer_order_net_revenue_cents: 10n,
      new_customer_order_count: 1.5,
      repeat_customer_order_net_revenue_cents: -20n,
      repeat_customer_order_count: 0,
    };
    const rows = [
      first,
      { ...first, date: "2026-09-02", new_customer_order_net_revenue_cents: 20n },
      { ...first, sm_store_id: "other" },
      { ...first, sm_channel: "Amazon" },
      { ...first, date: "2026-08-31" },
      source("2026-09-03", 20, 1n, 1n), // Missing classification, not a zero or inferred repeat order.
    ];
    for (const grain of ["day", "week", "month"] as const) {
      const data = toOverviewData(
        decodeRows(OverviewRow, aggregateOverviewWire(rows, "s1", RANGE, grain, "Online DTC"), OVERVIEW_RELATION),
      );
      expect(data.purchases).toEqual({
        first: { netRevenue: "0.3", orders: 3 },
        repeat: { netRevenue: "-0.4", orders: 0 },
      });
      expect(data.totals?.orders).toBe(220);
    }
    const missing = toOverviewData(
      decodeRows(OverviewRow, aggregateOverviewWire([source("2026-09-01", 1, 1n, 1n)], "s1", RANGE), OVERVIEW_RELATION),
    );
    expect(missing.purchases).toEqual({
      first: { netRevenue: null, orders: null },
      repeat: { netRevenue: null, orders: null },
    });
  });

  it("names the relation and column when a row does not match", () => {
    const wire = aggregateOverviewWire([source("2026-09-01", 1, 1n, 1n)], "s1", RANGE);
    const bad = [{ ...wire[0], website_sessions: "12.5" }];
    try {
      decodeRows(OverviewRow, bad, OVERVIEW_RELATION);
      throw new Error("expected an incompatible-schema error");
    } catch (error) {
      expect(error).toBeInstanceOf(WarehouseError);
      expect(error).toMatchObject({
        kind: "incompatible_schema",
        relation: OVERVIEW_RELATION,
        column: "website_sessions",
      });
    }
  });
});
