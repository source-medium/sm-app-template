import { datesInRange, addDays, matchesSalesChannel, type DateRange } from "@/lib/filters";
import { sampleOrderRowsForDay, type WireOrder } from "@/lib/sample/orders";
import { normalizeCountry, normalizeRegion } from "@/lib/shipping-geography";
import { sumDecimals, toUnits } from "@/lib/data/decimal";
import type { GeographyFilters, GeographyData } from "./queries";
import { toGeographyData } from "./rows";
export function sampleGeography(filters: GeographyFilters, baseline: DateRange | null): GeographyData {
  const dates = new Set([...datesInRange(filters.range), ...(baseline ? datesInRange(baseline) : [])]);
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
  const aggregate = (selected: typeof rows) => {
    const now = selected.filter((row) => row.day >= filters.range.from && row.day <= filters.range.to);
    const before = selected.filter((row) => baseline && row.day >= baseline.from && row.day <= baseline.to);
    return {
      records: String(now.length),
      orders: String(now.filter((row) => row.order_key != null).length),
      revenue: sumDecimals(now.map((row) => row.order_net_revenue ?? null)),
      previous_records: String(before.length),
      previous_orders: String(before.filter((row) => row.order_key != null).length),
      previous_revenue: sumDecimals(before.map((row) => row.order_net_revenue ?? null)),
      latest_date:
        now
          .map((row) => row.day)
          .sort()
          .at(-1) ?? null,
      previous_latest_date:
        before
          .map((row) => row.day)
          .sort()
          .at(-1) ?? null,
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
