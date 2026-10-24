/** Deterministic source-grain fixtures for rpt_executive_summary_daily. */
import { datesInRange, type DateRange } from "@/lib/filters";
import { calendarDate } from "@/lib/format";
import { isValidSalesChannel } from "@/lib/sales-channels";
import { randomInt, seededRandom } from "./random";
import { SAMPLE_STORE_SCALE, SAMPLE_STORES } from "./stores";

export type SummarySourceRow = {
  sm_store_id: string;
  sm_channel: string;
  sm_sub_channel: string;
  date: string;
  order_net_revenue_cents: bigint;
  order_gross_revenue_cents: bigint | null;
  order_discounts_cents: bigint | null;
  order_refunds_cents: bigint | null;
  order_count: number;
  website_sessions: bigint;
  ad_clicks: bigint;
  ad_spend_cents: bigint;
  new_customer_order_net_revenue_cents: bigint | null;
  new_customer_order_count: number | null;
  repeat_customer_order_net_revenue_cents: bigint | null;
  repeat_customer_order_count: number | null;
};

const SOURCES = [
  {
    channel: "online_dtc",
    subChannel: "Paid Social",
    share: 0.34,
    sessionsPerOrder: 38,
    clicksPerOrder: 14,
    centsPerClick: 92,
  },
  {
    channel: "online_dtc",
    subChannel: "Organic Search",
    share: 0.28,
    sessionsPerOrder: 42,
    clicksPerOrder: 0,
    centsPerClick: 0,
  },
  {
    channel: "online_dtc",
    subChannel: "Email",
    share: 0.18,
    sessionsPerOrder: 22,
    clicksPerOrder: 0,
    centsPerClick: 0,
  },
  {
    channel: "amazon",
    subChannel: "Marketplace",
    share: 0.2,
    sessionsPerOrder: 0,
    clicksPerOrder: 3,
    centsPerClick: 61,
  },
  {
    // Not a valid channel. Like the live relation, it counts exchange orders without sales or customers.
    channel: "exchanged",
    subChannel: "Exchanges",
    share: 0.02,
    sessionsPerOrder: 0,
    clicksPerOrder: 0,
    centsPerClick: 0,
  },
] as const;
/** Average net revenue per order, in cents. */
const ORDER_VALUE_CENTS = 6840;

/**
 * A row as summary reports measure it (validSales in channel-sql): outside the valid sales channels
 * its order measures add nothing, while spend and traffic still count.
 */
export function countedSales(row: SummarySourceRow): SummarySourceRow {
  if (isValidSalesChannel(row.sm_channel)) return row;
  return {
    ...row,
    order_net_revenue_cents: 0n,
    order_gross_revenue_cents: 0n,
    order_discounts_cents: 0n,
    order_refunds_cents: 0n,
    order_count: 0,
    new_customer_order_net_revenue_cents: 0n,
    new_customer_order_count: 0,
    repeat_customer_order_net_revenue_cents: 0n,
    repeat_customer_order_count: 0,
  };
}

/** The channels the relation publishes for one store and dates, as the live channel rosters list them. */
export function sampleSummaryChannels(storeId: string, range: DateRange): string[] {
  return [...new Set(sampleSummarySource(storeId, range).map((row) => row.sm_channel))].sort();
}

/**
 * The relation's rows for one store. Dates after `today` (by default, the
 * store's date in its time zone) carry targets only, so every actual measure
 * is zero.
 */
export function sampleSummarySource(storeId: string, range: DateRange, today?: string): SummarySourceRow[] {
  const store = SAMPLE_STORES.find((candidate) => candidate.id === storeId);
  const scale = SAMPLE_STORE_SCALE.get(storeId);
  if (!store || scale === undefined) return [];
  const cutoff = today ?? calendarDate(new Date(), store.timeZone);
  const rows: SummarySourceRow[] = [];
  for (const date of datesInRange(range)) {
    const day = seededRandom(`overview|${storeId}|${date}`);
    // About one day in fifteen has no rows at all for the smaller store: a gap, not a zero.
    if (storeId === "sample-store-b" && day() < 0.07) continue;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekly = weekday === 0 || weekday === 6 ? 0.82 : 1.06;
    const dailyOrders = 140 * scale * weekly * (0.85 + day() * 0.3);

    for (const source of SOURCES) {
      const base = { sm_store_id: storeId, sm_channel: source.channel, sm_sub_channel: source.subChannel, date };
      if (date > cutoff) {
        rows.push({
          ...base,
          order_net_revenue_cents: 0n,
          order_gross_revenue_cents: 0n,
          order_discounts_cents: 0n,
          order_refunds_cents: 0n,
          order_count: 0,
          website_sessions: 0n,
          ad_clicks: 0n,
          ad_spend_cents: 0n,
          new_customer_order_net_revenue_cents: 0n,
          new_customer_order_count: 0,
          repeat_customer_order_net_revenue_cents: 0n,
          repeat_customer_order_count: 0,
        });
        continue;
      }
      const valid = isValidSalesChannel(source.channel);
      const random = seededRandom(`overview|${storeId}|${date}|${source.subChannel}`);
      // Marketplace orders arrive split across attribution, so the measure can be fractional.
      const orders =
        source.channel === "amazon"
          ? Math.round(dailyOrders * source.share * 2) / 2
          : Math.round(dailyOrders * source.share);
      const clicks =
        source.clicksPerOrder === 0 ? 0 : randomInt(random, 0, 9) + Math.round(orders * source.clicksPerOrder);
      const row = {
        ...base,
        order_net_revenue_cents: valid ? BigInt(Math.round(orders * ORDER_VALUE_CENTS * (0.85 + random() * 0.3))) : 0n,
        order_count: orders,
        website_sessions: BigInt(Math.round(orders * source.sessionsPerOrder * (0.9 + random() * 0.2))),
        ad_clicks: BigInt(clicks),
        ad_spend_cents: BigInt(Math.round(clicks * source.centsPerClick * (0.8 + random() * 0.4))),
      };
      const acquisition = seededRandom(`purchases|${storeId}|${date}|${source.subChannel}`);
      const firstOrders = valid ? Math.floor(orders * (0.35 + acquisition() * 0.25)) : 0;
      const firstRevenue = (row.order_net_revenue_cents * BigInt(Math.round((0.4 + acquisition() * 0.2) * 100))) / 100n;
      rows.push({
        ...row,
        order_gross_revenue_cents:
          row.order_net_revenue_cents + row.order_net_revenue_cents / 10n + row.order_net_revenue_cents / 50n,
        order_discounts_cents: -(row.order_net_revenue_cents / 10n),
        order_refunds_cents: -(row.order_net_revenue_cents / 50n),
        new_customer_order_net_revenue_cents: firstRevenue,
        new_customer_order_count: firstOrders,
        repeat_customer_order_net_revenue_cents: row.order_net_revenue_cents - firstRevenue,
        repeat_customer_order_count: valid ? orders - firstOrders : 0,
      });
    }
  }
  return rows;
}
