import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { DateRange } from "@/lib/filters";
import { orderDateExpression, orderDateWindow } from "@/lib/order-scope";
import { COUNTRY_SQL, REGION_SQL } from "@/lib/shipping-geography";
import { SALES_CHANNEL_PREDICATE } from "@/lib/data/channel-sql";
import { periodParams, periodSql } from "@/lib/data/period-sql";
import type { GeographyData, GeographyFilters } from "./queries";
import { GEOGRAPHY_RELATION, MAX_GROUPS, toGeographyData } from "./rows";

export async function queryGeography(filters: GeographyFilters, baseline: DateRange | null): Promise<GeographyData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const at = orderDateExpression(filters.dateBasis);
  const period = periodSql("date");
  const aggregates = `COUNTIF(date BETWEEN @start_date AND @end_date) AS records,
    COUNTIF(date BETWEEN @start_date AND @end_date AND sm_order_key IS NOT NULL) AS orders,
    COUNTIF(@compare AND date BETWEEN @baseline_from AND @baseline_to) AS previous_records,
    COUNTIF(@compare AND date BETWEEN @baseline_from AND @baseline_to AND sm_order_key IS NOT NULL) AS previous_orders,
    ${period.sum("order_net_revenue", "revenue")},
    MAX(IF(date BETWEEN @start_date AND @end_date, date, NULL)) AS latest_date,
    MAX(IF(@compare AND date BETWEEN @baseline_from AND @baseline_to, date, NULL)) AS previous_latest_date`;
  const columns =
    "records, orders, revenue, previous_records, previous_orders, previous_revenue, latest_date, previous_latest_date";
  const result = await warehouse.query({
    name: "geography",
    maxRows: MAX_GROUPS + 370,
    sql: `WITH scoped AS (
      SELECT sm_order_key, order_net_revenue, DATE(${at}) AS date,
        ${filters.country ? REGION_SQL : COUNTRY_SQL} AS location
      FROM ${warehouse.table(GEOGRAPHY_RELATION)}
      WHERE sm_store_id = @store_id AND is_order_sm_valid = TRUE
        AND (${orderDateWindow(filters.dateBasis, "@start_date", "@end_date")}
          OR (@compare AND ${orderDateWindow(filters.dateBasis, "@baseline_from", "@baseline_to")}))
        AND ${SALES_CHANNEL_PREDICATE}
        AND (@country = '' OR ${COUNTRY_SQL} = @country)
        AND (@region = '' OR ${REGION_SQL} = @region)
    ), grouped AS (SELECT location, ${aggregates} FROM scoped GROUP BY location),
    ranked AS (SELECT *, ROW_NUMBER() OVER (ORDER BY revenue DESC NULLS LAST, location) AS position FROM grouped),
    totals AS (SELECT ${aggregates} FROM scoped),
    daily AS (SELECT date, ${aggregates} FROM scoped WHERE date BETWEEN @start_date AND @end_date GROUP BY date)
    SELECT 'total' AS kind, '' AS location, CAST(NULL AS DATE) AS date, ${columns} FROM totals
    UNION ALL SELECT 'group', location, CAST(NULL AS DATE), ${columns} FROM ranked WHERE position <= ${MAX_GROUPS}
    UNION ALL SELECT 'remainder', '(other)', CAST(NULL AS DATE), SUM(records), SUM(orders), SUM(revenue), SUM(previous_records), SUM(previous_orders), SUM(previous_revenue), MAX(latest_date), MAX(previous_latest_date) FROM ranked WHERE position > ${MAX_GROUPS} HAVING COUNT(*) > 0
    UNION ALL SELECT 'trend', '', date, ${columns} FROM daily
    ORDER BY kind, revenue DESC NULLS LAST, location, date`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "country", type: "STRING", value: filters.country ?? "" },
      { name: "region", type: "STRING", value: filters.region ?? "" },
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      ...periodParams(filters.range, baseline),
    ],
  });
  return toGeographyData(result.rows);
}
