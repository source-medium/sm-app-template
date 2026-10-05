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
import { datesInRange, todayUtc, type DateRange, type ReportFilters } from "@/lib/filters";
import { randomInt, seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import type { OverviewData } from "./queries";
import { OVERVIEW_RELATION, OverviewRow, toOverviewData } from "./rows";

export type OverviewSourceRow = {
  sm_store_id: string;
  sm_channel: string;
  sm_sub_channel: string;
  date: string;
  order_net_revenue_cents: bigint;
  order_count: number;
  website_sessions: bigint;
  ad_clicks: bigint;
  ad_spend_cents: bigint;
};

const SOURCES = [
  {
    channel: "Online DTC",
    subChannel: "Paid Social",
    share: 0.34,
    sessionsPerOrder: 38,
    clicksPerOrder: 14,
    centsPerClick: 92,
  },
  {
    channel: "Online DTC",
    subChannel: "Organic Search",
    share: 0.28,
    sessionsPerOrder: 42,
    clicksPerOrder: 0,
    centsPerClick: 0,
  },
  {
    channel: "Online DTC",
    subChannel: "Email",
    share: 0.18,
    sessionsPerOrder: 22,
    clicksPerOrder: 0,
    centsPerClick: 0,
  },
  {
    channel: "Amazon",
    subChannel: "Marketplace",
    share: 0.2,
    sessionsPerOrder: 0,
    clicksPerOrder: 3,
    centsPerClick: 61,
  },
] as const;
/** Average net revenue per order, in cents. */
const ORDER_VALUE_CENTS = 6840;

/** The relation's rows for one store. Dates after `today` carry targets only, so every actual measure is zero. */
export function sampleOverviewSource(storeId: string, range: DateRange, today: string): OverviewSourceRow[] {
  const scale = SAMPLE_STORE_SCALE[storeId] ?? 0;
  const rows: OverviewSourceRow[] = [];
  for (const date of datesInRange(range)) {
    const day = seededRandom(`overview|${storeId}|${date}`);
    // About one day in fifteen has no rows at all for the smaller store: a gap, not a zero.
    if (storeId === "sample-store-b" && day() < 0.07) continue;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekly = weekday === 0 || weekday === 6 ? 0.82 : 1.06;
    const dailyOrders = 140 * scale * weekly * (0.85 + day() * 0.3);

    for (const source of SOURCES) {
      const base = { sm_store_id: storeId, sm_channel: source.channel, sm_sub_channel: source.subChannel, date };
      if (date > today) {
        rows.push({
          ...base,
          order_net_revenue_cents: 0n,
          order_count: 0,
          website_sessions: 0n,
          ad_clicks: 0n,
          ad_spend_cents: 0n,
        });
        continue;
      }
      const random = seededRandom(`overview|${storeId}|${date}|${source.subChannel}`);
      // Marketplace orders arrive split across attribution, so the measure can be fractional.
      const orders =
        source.channel === "Amazon"
          ? Math.round(dailyOrders * source.share * 2) / 2
          : Math.round(dailyOrders * source.share);
      const clicks =
        source.clicksPerOrder === 0 ? 0 : randomInt(random, 0, 9) + Math.round(orders * source.clicksPerOrder);
      rows.push({
        ...base,
        order_net_revenue_cents: BigInt(Math.round(orders * ORDER_VALUE_CENTS * (0.85 + random() * 0.3))),
        order_count: orders,
        website_sessions: BigInt(Math.round(orders * source.sessionsPerOrder * (0.9 + random() * 0.2))),
        ad_clicks: BigInt(clicks),
        ad_spend_cents: BigInt(Math.round(clicks * source.centsPerClick * (0.8 + random() * 0.4))),
      });
    }
  }
  return rows;
}

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
export function aggregateOverviewWire(source: OverviewSourceRow[], storeId: string, range: DateRange) {
  const byDate = new Map<string, Sums>();
  for (const row of source) {
    if (row.sm_store_id !== storeId || row.date < range.from || row.date > range.to) continue;
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
  const totals = zero();
  for (const [, sums] of days) add(totals, sums);
  return days.map(([date, sums]) => ({
    date,
    net_revenue: money(sums.revenue),
    order_count: String(sums.orders),
    website_sessions: String(sums.sessions),
    ad_clicks: String(sums.clicks),
    ad_spend: money(sums.spend),
    total_net_revenue: money(totals.revenue),
    total_order_count: String(totals.orders),
    total_website_sessions: String(totals.sessions),
    total_ad_clicks: String(totals.clicks),
    total_ad_spend: money(totals.spend),
  }));
}

export async function sampleOverview(filters: ReportFilters, now: Date = new Date()): Promise<OverviewData> {
  const source = sampleOverviewSource(filters.storeId, filters.range, todayUtc(now));
  const wire = aggregateOverviewWire(source, filters.storeId, filters.range);
  return toOverviewData(decodeRows(OverviewRow, wire, OVERVIEW_RELATION));
}
