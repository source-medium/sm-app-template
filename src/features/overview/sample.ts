import { matchesSalesChannel } from "@/lib/filters";
/**
 * Overview, sample. Generates source-grain rows (store, channel,
 * sub-channel, date) the way the warehouse relation holds them, then
 * aggregates them exactly as the live SQL does and emits BigQuery's wire
 * format, so the result decodes through the same row schema.
 *
 * Deterministic: every value depends only on the store, the date, and the
 * channel. The cases the live data has are here on purpose: fractional
 * order measures, dates with no rows (gaps), and forward-dated target rows
 * whose actual measures are zero. Money is generated in whole cents so sums
 * stay exact, as NUMERIC sums are in BigQuery.
 */
import { decodeRows } from "@/lib/data/decode";
import { fromUnits } from "@/lib/data/decimal";
import { type DateRange } from "@/lib/filters";
import { countedSales, sampleSummarySource, type SummarySourceRow } from "@/lib/sample/executive-summary";
import { isValidSalesChannel } from "@/lib/sales-channels";
import { periodStart, type TimeGrain } from "@/lib/time-grain";
import type { OverviewData, OverviewFilters } from "./queries";
import { OVERVIEW_RELATION, OverviewRow, toOverviewData } from "./rows";

type Sums = { revenue: bigint; orders: number; sessions: bigint; clicks: bigint; spend: bigint };
const zero = (): Sums => ({ revenue: 0n, orders: 0, sessions: 0n, clicks: 0n, spend: 0n });
function add(sums: Sums, row: Sums): void {
  sums.revenue += row.revenue;
  sums.orders += row.orders;
  sums.sessions += row.sessions;
  sums.clicks += row.clicks;
  sums.spend += row.spend;
}
/** Cents as NUMERIC decimal text. */
const money = (cents: bigint) => fromUnits(cents * 10_000_000n);

/** The live SQL, in memory: sum by date, then period totals over those days, in BigQuery's wire format. */
export function aggregateOverviewWire(
  source: SummarySourceRow[],
  storeId: string,
  range: DateRange,
  grain: TimeGrain = "day",
  channel: string | null = null,
) {
  const byDate = new Map<string, Sums>();
  const contributions = new Map<string, { channel: string; sub_channel: string; revenue: bigint }>();
  let gross: bigint | null = null;
  let discounts: bigint | null = null;
  let refunds: bigint | null = null;
  let firstRevenue: bigint | null = null;
  let firstOrders: number | null = null;
  let repeatRevenue: bigint | null = null;
  let repeatOrders: number | null = null;
  // Order measures count valid sales channels only, as the live query's validSales() does.
  for (const row of source.map(countedSales)) {
    if (
      row.sm_store_id !== storeId ||
      row.date < range.from ||
      row.date > range.to ||
      !matchesSalesChannel(channel, row.sm_channel)
    )
      continue;
    if (row.order_gross_revenue_cents !== null) gross = (gross ?? 0n) + row.order_gross_revenue_cents;
    if (row.order_discounts_cents !== null) discounts = (discounts ?? 0n) + row.order_discounts_cents;
    if (row.order_refunds_cents !== null) refunds = (refunds ?? 0n) + row.order_refunds_cents;
    // Match SQL SUM: ignore nulls, but preserve an entirely missing measure.
    if (row.new_customer_order_net_revenue_cents !== null)
      firstRevenue = (firstRevenue ?? 0n) + row.new_customer_order_net_revenue_cents;
    if (row.new_customer_order_count !== null) firstOrders = (firstOrders ?? 0) + row.new_customer_order_count;
    if (row.repeat_customer_order_net_revenue_cents !== null)
      repeatRevenue = (repeatRevenue ?? 0n) + row.repeat_customer_order_net_revenue_cents;
    if (row.repeat_customer_order_count !== null) repeatOrders = (repeatOrders ?? 0) + row.repeat_customer_order_count;
    // Contributions list sales channels only, as the live query's WHERE does.
    if (isValidSalesChannel(row.sm_channel)) {
      const identity = JSON.stringify([row.sm_channel, row.sm_sub_channel]);
      const contribution = contributions.get(identity) ?? {
        channel: row.sm_channel,
        sub_channel: row.sm_sub_channel,
        revenue: 0n,
      };
      contribution.revenue += row.order_net_revenue_cents;
      contributions.set(identity, contribution);
    }
    const sums = byDate.get(row.date) ?? zero();
    add(sums, {
      revenue: row.order_net_revenue_cents,
      orders: row.order_count,
      sessions: row.website_sessions,
      clicks: row.ad_clicks,
      spend: row.ad_spend_cents,
    });
    byDate.set(row.date, sums);
  }
  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const latestDate = days.at(-1)?.[0] ?? null;
  const totals = zero();
  for (const [, sums] of days) add(totals, sums);
  const periods = new Map<string, Sums>();
  for (const [date, sums] of days) {
    const key = periodStart(date, grain);
    const total = periods.get(key) ?? zero();
    add(total, sums);
    periods.set(key, total);
  }
  return days.map(([date, sums]) => {
    const bucket = periodStart(date, grain);
    const total = periods.get(bucket);
    if (!total) throw new Error("Missing sample summary period");
    return {
      date,
      contributions_json:
        date === days[0]?.[0]
          ? JSON.stringify(
              [...contributions.values()].map((row) => ({ ...row, revenue: money(row.revenue), remainder: false })),
            )
          : null,
      net_revenue: money(sums.revenue),
      order_count: String(sums.orders),
      website_sessions: String(sums.sessions),
      ad_clicks: String(sums.clicks),
      ad_spend: money(sums.spend),
      period_date: bucket,
      period_net_revenue: money(total.revenue),
      period_order_count: String(total.orders),
      period_website_sessions: String(total.sessions),
      period_ad_clicks: String(total.clicks),
      period_ad_spend: money(total.spend),
      total_gross: gross === null ? null : money(gross),
      total_discounts: discounts === null ? null : money(discounts),
      total_refunds: refunds === null ? null : money(refunds),
      total_net_revenue: money(totals.revenue),
      total_order_count: String(totals.orders),
      total_website_sessions: String(totals.sessions),
      total_ad_clicks: String(totals.clicks),
      total_ad_spend: money(totals.spend),
      total_first_revenue: firstRevenue === null ? null : money(firstRevenue),
      total_first_orders: firstOrders === null ? null : String(firstOrders),
      total_repeat_revenue: repeatRevenue === null ? null : money(repeatRevenue),
      total_repeat_orders: repeatOrders === null ? null : String(repeatOrders),
      latest_date: latestDate,
    };
  });
}

export async function sampleOverview(filters: OverviewFilters, today?: string): Promise<OverviewData> {
  const source = sampleSummarySource(filters.storeId, filters.range, today);
  const wire = aggregateOverviewWire(source, filters.storeId, filters.range, filters.grain, filters.channel);
  return toOverviewData(decodeRows(OverviewRow, wire, OVERVIEW_RELATION));
}
