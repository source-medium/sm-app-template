/**
 * Overview, sample. Generates source-grain rows (store, channel,
 * sub-channel, date) the way the warehouse relation holds them, then
 * aggregates them exactly as the live SQL does and emits BigQuery's wire
 * format, so the result decodes through the same row schema.
 *
 * Deterministic: every value depends only on the store, the date, and the
 * channel. The cases the live data has are here on purpose: fractional
 * order measures, dates with no rows (gaps), and forward-dated target rows
 * whose actual measures are zero.
 */
import { decodeRows } from "@/lib/data/decode";
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
  order_count: number;
  website_sessions: bigint;
  ad_clicks: bigint;
};

const SOURCES = [
  { channel: "Online DTC", subChannel: "Paid Social", orders: 0.34, sessionsPerOrder: 38, clicksPerOrder: 14 },
  { channel: "Online DTC", subChannel: "Organic Search", orders: 0.28, sessionsPerOrder: 42, clicksPerOrder: 0 },
  { channel: "Online DTC", subChannel: "Email", orders: 0.18, sessionsPerOrder: 22, clicksPerOrder: 0 },
  { channel: "Amazon", subChannel: "Marketplace", orders: 0.2, sessionsPerOrder: 0, clicksPerOrder: 3 },
] as const;

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
      if (date > today) {
        rows.push({
          sm_store_id: storeId,
          sm_channel: source.channel,
          sm_sub_channel: source.subChannel,
          date,
          order_count: 0,
          website_sessions: 0n,
          ad_clicks: 0n,
        });
        continue;
      }
      const random = seededRandom(`overview|${storeId}|${date}|${source.subChannel}`);
      // Marketplace orders arrive split across attribution, so the measure can be fractional.
      const orders =
        source.channel === "Amazon"
          ? Math.round(dailyOrders * source.orders * 2) / 2
          : Math.round(dailyOrders * source.orders);
      rows.push({
        sm_store_id: storeId,
        sm_channel: source.channel,
        sm_sub_channel: source.subChannel,
        date,
        order_count: orders,
        website_sessions: BigInt(Math.round(orders * source.sessionsPerOrder * (0.9 + random() * 0.2))),
        ad_clicks: BigInt(
          source.clicksPerOrder === 0 ? 0 : randomInt(random, 0, 9) + Math.round(orders * source.clicksPerOrder),
        ),
      });
    }
  }
  return rows;
}

/** The live SQL, in memory: sum by date, then period totals over those days, in BigQuery's wire format. */
export function aggregateOverviewWire(source: OverviewSourceRow[], storeId: string, range: DateRange) {
  const byDate = new Map<string, { orders: number; sessions: bigint; clicks: bigint }>();
  for (const row of source) {
    if (row.sm_store_id !== storeId || row.date < range.from || row.date > range.to) continue;
    const sums = byDate.get(row.date) ?? { orders: 0, sessions: 0n, clicks: 0n };
    sums.orders += row.order_count;
    sums.sessions += row.website_sessions;
    sums.clicks += row.ad_clicks;
    byDate.set(row.date, sums);
  }
  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const totals = days.reduce(
    (acc, [, sums]) => ({
      orders: acc.orders + sums.orders,
      sessions: acc.sessions + sums.sessions,
      clicks: acc.clicks + sums.clicks,
    }),
    { orders: 0, sessions: 0n, clicks: 0n },
  );
  return days.map(([date, sums]) => ({
    date,
    order_count: String(sums.orders),
    website_sessions: String(sums.sessions),
    ad_clicks: String(sums.clicks),
    total_order_count: String(totals.orders),
    total_website_sessions: String(totals.sessions),
    total_ad_clicks: String(totals.clicks),
  }));
}

export async function sampleOverview(filters: ReportFilters, now: Date = new Date()): Promise<OverviewData> {
  const source = sampleOverviewSource(filters.storeId, filters.range, todayUtc(now));
  const wire = aggregateOverviewWire(source, filters.storeId, filters.range);
  return toOverviewData(decodeRows(OverviewRow, wire, OVERVIEW_RELATION));
}
