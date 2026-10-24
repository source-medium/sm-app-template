import { datesInRange, addDays, matchesSalesChannel, type DateRange } from "@/lib/filters";
import { sampleOrderRowsForDay, type WireOrder } from "@/lib/sample/orders";
import { normalizeCountry, normalizeRegion } from "@/lib/shipping-geography";
import { sumDecimals, toUnits } from "@/lib/data/decimal";
import type { GeographyFilters, GeographyData } from "./queries";
import { toGeographyData } from "./rows";
import type { BaselineRanges } from "@/lib/comparison";
export function sampleGeography(filters: GeographyFilters, baselines: BaselineRanges): GeographyData {
  const [baseline, second] = baselines;
  const dates = new Set([
    ...datesInRange(filters.range),
    ...baselines.flatMap((period) => (period ? datesInRange(period) : [])),
  ]);
  const sourceDates = new Set(dates);
  if (filters.dateBasis === "processed") for (const date of dates) sourceDates.add(addDays(date, -1));
  const rows = [...sourceDates]
    .flatMap((date) => sampleOrderRowsForDay(filters.storeId, date))
    .map((row): WireOrder & { day: string; country: string; region: string } => ({
      ...row,
      day:
        (filters.dateBasis === "created"
          ? row.order_created_at_local_datetime
          : (row.order_processed_at_local_datetime ?? row.order_created_at_local_datetime)
        )?.slice(0, 10) ?? "",
      country: normalizeCountry(row.order_shipping_country_code ?? null),
      region: normalizeRegion(row.order_shipping_country_code ?? null, row.order_shipping_state ?? null),
    }))
    .filter(
      (row) =>
        dates.has(row.day) &&
        row.is_order_sm_valid === "true" &&
        matchesSalesChannel(filters.channel, row.sm_channel) &&
        (!filters.country || row.country === filters.country) &&
        (!filters.region || row.region === filters.region),
    );
  const within = (selected: typeof rows, period: DateRange | null) =>
    selected.filter((row) => period && row.day >= period.from && row.day <= period.to);
  const latest = (selected: typeof rows) =>
    selected
      .map((row) => row.day)
      .sort()
      .at(-1) ?? null;
  const aggregate = (selected: typeof rows) => {
    const now = within(selected, filters.range);
    const before = within(selected, baseline);
    const earlier = within(selected, second);
    return {
      records: String(now.length),
      orders: String(now.filter((row) => row.order_key != null).length),
      revenue: sumDecimals(now.map((row) => row.order_net_revenue ?? null)),
      previous_records: String(before.length),
      previous_orders: String(before.filter((row) => row.order_key != null).length),
      previous_revenue: sumDecimals(before.map((row) => row.order_net_revenue ?? null)),
      second_records: String(earlier.length),
      second_orders: String(earlier.filter((row) => row.order_key != null).length),
      second_revenue: sumDecimals(earlier.map((row) => row.order_net_revenue ?? null)),
      latest_date: latest(now),
      previous_latest_date: latest(before),
      second_latest_date: latest(earlier),
    };
  };
  const locations = [...new Set(rows.map((row) => (filters.country ? row.region : row.country)))];
  const data = toGeographyData([
    { kind: "total", location: "", date: null, ...aggregate(rows) },
    ...locations.map((location) => ({
      kind: "group",
      location,
      date: null,
      ...aggregate(rows.filter((row) => (filters.country ? row.region : row.country) === location)),
    })),
    ...datesInRange(filters.range)
      .filter((date) => rows.some((row) => row.day === date))
      .map((date) => ({ kind: "trend", location: "", date, ...aggregate(rows.filter((row) => row.day === date)) })),
  ]);
  data.groups.sort((a, b) => {
    if (a.revenue === null || b.revenue === null)
      return a.revenue === b.revenue ? a.location.localeCompare(b.location) : a.revenue === null ? 1 : -1;
    return toUnits(a.revenue) > toUnits(b.revenue)
      ? -1
      : toUnits(a.revenue) < toUnits(b.revenue)
        ? 1
        : a.location.localeCompare(b.location);
  });
  return data;
}
