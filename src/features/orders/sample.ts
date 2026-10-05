/**
 * Orders, sample. Each day's orders are generated from the store and the
 * date alone, so any page, search, or detail read regenerates the same
 * orders without stored fixtures. Rows are emitted in BigQuery's wire
 * format and decoded through the same row schemas as live data; money is
 * generated in whole cents.
 */
import { decodeRows } from "@/lib/data/decode";
import { fromUnits } from "@/lib/data/decimal";
import { datesInRange } from "@/lib/filters";
import { randomInt, seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { PAGE_SIZE, type OrderDetail, type OrderRef, type OrdersFilters, type OrdersPage } from "./queries";
import { ORDERS_RELATION, OrderDetailRow, OrderSummaryRow, toOrderDetail, toOrderSummary } from "./rows";

const EPOCH_DAY = Date.parse("2024-01-01T00:00:00Z") / 86_400_000;
/** Sample stores report in UTC-5, so local wall time is five hours behind the instant. */
const OFFSET_MS = 5 * 3_600_000;
const CHANNELS = [
  ["Online DTC", "Paid Social"],
  ["Online DTC", "Organic Search"],
  ["Online DTC", "Email"],
  ["Online DTC", "Direct"],
  ["Amazon", "Marketplace"],
] as const;
const PRODUCTS = [
  { title: "Everyday Tote", cents: 6800 },
  { title: "Linen Set", cents: 12400 },
  { title: "Canvas Weekender", cents: 15800 },
  { title: "Travel Pouch", cents: 2400 },
  { title: "Market Bag", cents: 3600 },
] as const;
const COUNTRIES = [
  ["United States", "NY"],
  ["United States", "CA"],
  ["United States", "TX"],
  ["Canada", "ON"],
] as const;

type WireOrder = Record<string, string | null>;
const money = (cents: number) => fromUnits(BigInt(cents) * 10_000_000n);

function ordersForDay(storeId: string, date: string): WireOrder[] {
  const scale = SAMPLE_STORE_SCALE[storeId] ?? 0;
  const day = seededRandom(`orders|${storeId}|${date}`);
  const count = Math.round(16 * scale * (0.8 + day() * 0.4));
  const dayNumber = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000 - EPOCH_DAY);
  const orders: WireOrder[] = [];
  for (let index = 0; index < count; index += 1) {
    const random = seededRandom(`order|${storeId}|${date}|${index}`);
    const seconds = Math.floor((index / count) * 86_000) + randomInt(random, 0, 300);
    const createdLocalMs = Date.parse(`${date}T00:00:00Z`) + seconds * 1000;
    const processedLocalMs = createdLocalMs + 60_000;
    const number = 10_000 + dayNumber * 40 + index;
    const [channel, subChannel] = CHANNELS[randomInt(random, 0, CHANNELS.length - 1)] ?? CHANNELS[0];
    const [country, state] = COUNTRIES[randomInt(random, 0, COUNTRIES.length - 1)] ?? COUNTRIES[0];
    const product = PRODUCTS[randomInt(random, 0, PRODUCTS.length - 1)] ?? PRODUCTS[0];
    const items = randomInt(random, 1, 3);
    const cancelled = random() < 0.03;
    const gross = product.cents * items;
    const discount = random() < 0.2 ? Math.round(gross * 0.1) : 0;
    const refund = !cancelled && random() < 0.05 ? product.cents : 0;
    const net = gross - discount - refund;
    const shipping = gross >= 5000 ? 0 : 595;
    const taxes = Math.round(net * 0.08);
    orders.push({
      order_key: `${storeId}-${number}`,
      order_name: channel === "Amazon" ? `112-${String(number).padStart(7, "0")}` : `#${number}`,
      order_number: String(number),
      order_processed_at_local_datetime: new Date(processedLocalMs).toISOString().slice(0, 19),
      sm_channel: channel,
      sm_sub_channel: subChannel,
      sm_order_type: random() < 0.35 ? "repeat" : "first",
      order_payment_status: cancelled ? "voided" : refund > 0 ? "partially_refunded" : "paid",
      order_cart_quantity: String(items),
      order_net_revenue: money(cancelled ? 0 : net),
      order_id: String(5_000_000_000 + number),
      order_created_at: String(BigInt(createdLocalMs + OFFSET_MS) * 1000n),
      order_cancelled_at: cancelled ? String(BigInt(createdLocalMs + OFFSET_MS + 3_600_000) * 1000n) : null,
      order_cancellation_reason: cancelled ? "customer" : null,
      sm_order_sales_channel: channel === "Amazon" ? "Amazon" : "Online Store",
      source_system: channel === "Amazon" ? "amazon" : "shopify",
      order_refund_quantity: refund > 0 ? "1" : "0",
      order_gross_revenue: money(gross),
      order_discounts: money(discount),
      order_refunds: money(refund),
      order_net_shipping: money(shipping),
      order_total_taxes: money(taxes),
      order_total_revenue: money(cancelled ? 0 : net + shipping + taxes),
      order_shipping_country: country,
      order_shipping_state: state,
      sm_utm_source: subChannel === "Paid Social" ? "meta" : subChannel === "Email" ? "klaviyo" : null,
      sm_utm_medium: subChannel === "Paid Social" ? "paid_social" : subChannel === "Email" ? "email" : null,
      sm_utm_campaign: subChannel === "Paid Social" ? "prospecting_broad" : null,
      order_discount_codes_csv: discount > 0 ? "WELCOME10" : null,
      order_product_titles_csv: product.title,
      order_index: String(randomInt(random, 1, 6)),
      is_order_sm_valid: cancelled ? "false" : "true",
    });
  }
  return orders;
}

function matchesSearch(order: WireOrder, search: string): boolean {
  const name = order.order_name?.toLowerCase() ?? "";
  const term = search.toLowerCase();
  return (
    name.startsWith(term) || name.startsWith(`#${term}`) || order.order_number === search || order.order_id === search
  );
}

const processed = (order: WireOrder) => order.order_processed_at_local_datetime ?? "";

/** Newest first, then by key, the same order the live query uses. */
function compareNewestFirst(a: WireOrder, b: WireOrder): number {
  return processed(b).localeCompare(processed(a)) || (b.order_key ?? "").localeCompare(a.order_key ?? "");
}

function isAfterCursor(order: WireOrder, cursor: OrderRef): boolean {
  const at = processed(order);
  return at < cursor.processedLocal || (at === cursor.processedLocal && (order.order_key ?? "") < cursor.key);
}

export async function sampleOrders(filters: OrdersFilters): Promise<OrdersPage> {
  const rows = datesInRange(filters.range)
    .flatMap((date) => ordersForDay(filters.storeId, date))
    .filter((order) => processed(order).slice(0, 10) <= filters.range.to)
    .filter((order) => !filters.search || matchesSearch(order, filters.search))
    .filter((order) => !filters.cursor || isAfterCursor(order, filters.cursor))
    .sort(compareNewestFirst)
    .slice(0, PAGE_SIZE + 1);
  const orders = decodeRows(OrderSummaryRow, rows, ORDERS_RELATION).map(toOrderSummary);
  const page = orders.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    orders: page,
    nextCursor: orders.length > PAGE_SIZE && last ? { processedLocal: last.processedLocal, key: last.key } : null,
  };
}

export async function sampleOrderDetail(storeId: string, ref: OrderRef): Promise<OrderDetail | null> {
  const match = ordersForDay(storeId, ref.processedLocal.slice(0, 10)).find(
    (order) => order.order_key === ref.key && processed(order) === ref.processedLocal,
  );
  if (!match) return null;
  const [row] = decodeRows(OrderDetailRow, [match], ORDERS_RELATION);
  return row ? toOrderDetail(row) : null;
}
