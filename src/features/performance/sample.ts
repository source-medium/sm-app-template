import { matchesSalesChannel } from "@/lib/filters";
import { decodeRows } from "@/lib/data/decode";
import { fromUnits, sumDecimals } from "@/lib/data/decimal";
import { datesInRange } from "@/lib/filters";
import { sampleSummarySource } from "@/lib/sample/executive-summary";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { seededRandom } from "@/lib/sample/random";
import { periodStart } from "@/lib/time-grain";
import type { PerformanceFilters } from "./queries";
import { BUSINESS_RELATION, BusinessRow, PLATFORM_RELATION, PlatformRow } from "./rows";

type Wire = Record<string, string | null>;
const money = (value: bigint | null) => (value === null ? null : fromUnits(value * 10_000_000n));
function sum(rows: Wire[], fields: readonly string[]): Wire {
  return Object.fromEntries(fields.map((field) => [field, sumDecimals(rows.map((row) => row[field] ?? null))]));
}
export function sampleBusiness(filters: PerformanceFilters) {
  const source = sampleSummarySource(filters.storeId, filters.range)
    .filter((row) => matchesSalesChannel(filters.channel, row.sm_channel))
    .map((row) => ({
      period_date: periodStart(row.date, filters.grain),
      gross: money(row.order_gross_revenue_cents),
      discounts: money(row.order_discounts_cents),
      demand:
        row.order_gross_revenue_cents === null || row.order_discounts_cents === null
          ? null
          : money(row.order_gross_revenue_cents + row.order_discounts_cents),
      refunds: money(row.order_refunds_cents),
      revenue: money(row.order_net_revenue_cents),
      spend: money(row.ad_spend_cents),
      orders: String(row.order_count),
      sessions: String(row.website_sessions),
      first_revenue: money(row.new_customer_order_net_revenue_cents),
      repeat_revenue: money(row.repeat_customer_order_net_revenue_cents),
      first_orders: row.new_customer_order_count === null ? null : String(row.new_customer_order_count),
      repeat_orders: row.repeat_customer_order_count === null ? null : String(row.repeat_customer_order_count),
    }));
  const [first] = source;
  if (!first) return [];
  const fields = Object.keys(first).filter((field) => field !== "period_date");
  const dates = [...new Set(source.map((row) => row.period_date))].sort().reverse();
  return decodeRows(
    BusinessRow,
    [
      ...dates.map((date) => ({
        period_date: date,
        is_total: "false",
        ...sum(
          source.filter((row) => row.period_date === date),
          fields,
        ),
      })),
      { period_date: null, is_total: "true", ...sum(source, fields) },
    ],
    BUSINESS_RELATION,
  );
}
export function samplePlatforms(filters: PerformanceFilters) {
  const scale = SAMPLE_STORE_SCALE.get(filters.storeId);
  if (!scale) return [];
  const channels = (
    [
      ["Online DTC", 1],
      ["Amazon", 0.2],
    ] as const
  ).filter(([channel]) => matchesSalesChannel(filters.channel, channel));
  if (!channels.length) return [];
  const source: Wire[] = [];
  for (const date of datesInRange(filters.range)) {
    for (const [index, platform] of ["Meta", "Google", "Pinterest"].entries()) {
      const random = seededRandom(`performance|${filters.storeId}|${date}|${platform}`);
      const impressions = Math.round(((20000 + random() * 60000) * scale) / (index + 1));
      const clicks = Math.round(impressions * (0.01 + random() * 0.02));
      const spend = impressions * (0.8 + random());
      const roas = 2 + random() * 3;
      // Round each source channel once, before any selection or aggregation.
      for (const [, channelScale] of channels) {
        const channelSpend = Math.round(spend * channelScale);
        const channelClicks = Math.round(clicks * channelScale);
        source.push({
          period_date: periodStart(date, filters.grain),
          platform,
          spend: money(BigInt(channelSpend)),
          impressions: String(Math.round(impressions * channelScale)),
          clicks: String(channelClicks),
          conversions: String(Math.round(channelClicks * 0.025)),
          revenue: ((channelSpend / 100) * roas).toFixed(2),
        });
      }
    }
  }
  const dates = [...new Set(source.map((row) => row.period_date))].sort().reverse();
  const fields = ["spend", "impressions", "clicks", "conversions", "revenue"];
  const rows: Wire[] = [];
  for (const platform of [null, "Meta", "Google", "Pinterest"]) {
    const scoped = source.filter((row) => platform === null || row.platform === platform);
    const base = { platform, combined: String(platform === null) };
    for (const date of dates)
      rows.push({
        ...base,
        period_date: date ?? null,
        is_total: "false",
        ...sum(
          scoped.filter((row) => row.period_date === date),
          fields,
        ),
      });
    rows.push({ ...base, period_date: null, is_total: "true", ...sum(scoped, fields) });
  }
  return decodeRows(PlatformRow, rows, PLATFORM_RELATION);
}
