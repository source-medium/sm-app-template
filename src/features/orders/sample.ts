import { toOrderAttribution, type OrderAttribution } from "./attribution";
import { matchesSalesChannel } from "@/lib/filters";
/**
 * Orders, sample. Each day's orders are generated from the store and the
 * date alone, so any page, search, or detail read regenerates the same
 * orders without stored fixtures. Rows are emitted in BigQuery's wire
 * format and decoded through the same row schemas as live data; money is
 * generated in whole cents.
 */
import { decodeRows } from "@/lib/data/decode";
import { sampleOrderRowsForDay as ordersForDay, type WireOrder } from "@/lib/sample/orders";
import { normalizeCountry, normalizeRegion } from "@/lib/shipping-geography";
import type { OrderDateBasis } from "@/lib/order-scope";
import { addDays, datesInRange, type ReportFilters } from "@/lib/filters";
import { PAGE_SIZE, type OrderDetail, type OrderRef, type OrdersFilters, type OrdersPage } from "./queries";
import { ORDERS_RELATION, OrderDetailRow, OrderSummaryRow, toOrderDetail, toOrderSummary } from "./rows";

function matchesSearch(order: WireOrder, search: string): boolean {
  const name = order.order_name?.toLowerCase() ?? "";
  const term = search.toLowerCase();
  return (
    name.startsWith(term) || name.startsWith(`#${term}`) || order.order_number === search || order.order_id === search
  );
}

const processed = (order: WireOrder) => order.scope_local ?? order.order_processed_at_local_datetime ?? "";
function scopedRows(storeId: string, range: ReportFilters["range"], basis?: OrderDateBasis | null): WireOrder[] {
  return datesInRange({ from: basis === "processed" ? addDays(range.from, -1) : range.from, to: range.to })
    .flatMap((date) => ordersForDay(storeId, date))
    .map((row) =>
      basis
        ? {
            ...row,
            scope_local:
              basis === "created"
                ? (row.order_created_at_local_datetime ?? null)
                : (row.order_processed_at_local_datetime ?? row.order_created_at_local_datetime ?? null),
          }
        : row,
    )
    .filter((row) => processed(row).slice(0, 10) >= range.from && processed(row).slice(0, 10) <= range.to);
}
function matchesPopulation(row: WireOrder, filters: Pick<OrdersFilters, "validOnly" | "country" | "region">): boolean {
  return (
    (!filters.validOnly || row.is_order_sm_valid === "true") &&
    (!filters.country || normalizeCountry(row.order_shipping_country_code ?? null) === filters.country) &&
    (!filters.region ||
      normalizeRegion(row.order_shipping_country_code ?? null, row.order_shipping_state ?? null) === filters.region)
  );
}

/** Newest first, then by key, the same order the live query uses. */
function compareNewestFirst(a: WireOrder, b: WireOrder): number {
  return processed(b).localeCompare(processed(a)) || (b.order_key ?? "").localeCompare(a.order_key ?? "");
}

function isAfterCursor(order: WireOrder, cursor: OrderRef): boolean {
  const at = processed(order);
  return at < cursor.processedLocal || (at === cursor.processedLocal && (order.order_key ?? "") < cursor.key);
}

export async function sampleOrders(filters: OrdersFilters): Promise<OrdersPage> {
  const rows = scopedRows(filters.storeId, filters.range, filters.dateBasis)
    .filter((row) => matchesPopulation(row, filters))
    .filter((order) => matchesSalesChannel(filters.channel, order.sm_channel))
    .filter((order) => !filters.search || matchesSearch(order, filters.search))
    .filter((order) => !filters.cursor || isAfterCursor(order, filters.cursor))
    .sort(compareNewestFirst)
    .slice(0, PAGE_SIZE + 1);
  const orders = decodeRows(OrderSummaryRow, rows, ORDERS_RELATION).map(toOrderSummary);
  const page = orders.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    orders: page,
    nextCursor:
      orders.length > PAGE_SIZE && last
        ? {
            processedLocal: last.scopeLocal,
            key: last.key,
            ...(filters.dateBasis ? { dateBasis: filters.dateBasis } : {}),
          }
        : null,
  };
}

export async function sampleOrderDetail(storeId: string, ref: OrderRef): Promise<OrderDetail | null> {
  const day = ref.processedLocal.slice(0, 10);
  const match = scopedRows(storeId, { from: day, to: day }, ref.dateBasis).find(
    (order) => order.order_key === ref.key && processed(order) === ref.processedLocal,
  );
  if (!match) return null;
  const [row] = decodeRows(OrderDetailRow, [match], ORDERS_RELATION);
  return row ? toOrderDetail(row) : null;
}

export function sampleOrderChannels(
  filters: ReportFilters & Pick<OrdersFilters, "dateBasis" | "validOnly" | "country" | "region">,
): string[] {
  return [
    ...new Set(
      scopedRows(filters.storeId, filters.range, filters.dateBasis)
        .filter((row) => matchesPopulation(row, filters))
        .map((row) => row.sm_channel ?? "(none)"),
    ),
  ].sort();
}

export async function sampleOrderAttribution(storeId: string, ref: OrderRef): Promise<OrderAttribution> {
  const order = await sampleOrderDetail(storeId, ref);
  if (!order) return toOrderAttribution([], false);
  if (!order.utmSource) return toOrderAttribution([], false);
  return toOrderAttribution(
    [
      {
        evidence_type: "traffic_source_candidate",
        evidence_source: "sample_traffic_capture",
        sm_marketing_channel: order.subChannel,
        sm_utm_source: order.utmSource,
        sm_utm_medium: order.utmMedium,
        sm_attribution_inference_method: "raw_utm",
        sm_utm_final_source_priority: "1",
        winner_count: "1",
        signal_count: "2",
      },
      {
        evidence_type: "zero_party_candidate",
        evidence_source: "sample_survey_capture",
        sm_marketing_channel: null,
        sm_utm_source: null,
        sm_utm_medium: null,
        sm_attribution_inference_method: "not_applicable",
        sm_utm_final_source_priority: null,
        winner_count: "1",
        signal_count: "2",
      },
    ],
    false,
  );
}
