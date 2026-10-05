/**
 * Orders, sample. Each day's orders are generated from the store and the
 * date alone, so any page, search, or detail read regenerates the same
 * orders without stored fixtures. Rows are emitted in BigQuery's wire
 * format and decoded through the same row schemas as live data.
 */
import { decodeRows } from "@/lib/data/decode";
import { addDays, datesInRange } from "@/lib/filters";
import { randomInt, seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { PAGE_SIZE, type OrderCursor, type OrderDetail, type OrdersFilters, type OrdersPage } from "./queries";
import { ORDERS_RELATION, OrderDetailRow, OrderSummaryRow, toOrderDetail, toOrderSummary } from "./rows";

const EPOCH_DAY = Date.parse("2024-01-01T00:00:00Z") / 86_400_000;
/** Sample stores report in UTC-5, so local wall time is five hours behind the instant. */
const OFFSET_HOURS = 5;
const CHANNELS = [
  ["Online DTC", "Paid Social"],
  ["Online DTC", "Organic Search"],
  ["Online DTC", "Email"],
  ["Online DTC", "Direct"],
  ["Amazon", "Marketplace"],
] as const;
const PRODUCTS = ["Everyday Tote", "Linen Set", "Canvas Weekender", "Travel Pouch", "Market Bag"];
const COUNTRIES = [
  ["United States", "NY"],
  ["United States", "CA"],
  ["United States", "TX"],
  ["Canada", "ON"],
] as const;

type WireOrder = Record<string, string | null>;

function ordersForDay(storeId: string, date: string): WireOrder[] {
  const scale = SAMPLE_STORE_SCALE[storeId] ?? 0;
  const day = seededRandom(`orders|${storeId}|${date}`);
  const count = Math.round(16 * scale * (0.8 + day() * 0.4));
  const dayNumber = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000 - EPOCH_DAY);
  const orders: WireOrder[] = [];
  for (let index = 0; index < count; index += 1) {
    const random = seededRandom(`order|${storeId}|${date}|${index}`);
    const seconds = Math.floor((index / count) * 86_000) + randomInt(random, 0, 300);
    const localMs = Date.parse(`${date}T00:00:00Z`) + seconds * 1000;
    const instantMicros = BigInt(localMs + OFFSET_HOURS * 3_600_000) * 1000n;
    const number = 10_000 + dayNumber * 40 + index;
    const [channel, subChannel] = CHANNELS[randomInt(random, 0, CHANNELS.length - 1)] ?? CHANNELS[0];
    const [country, state] = COUNTRIES[randomInt(random, 0, COUNTRIES.length - 1)] ?? COUNTRIES[0];
    const items = randomInt(random, 1, 4);
    const product = PRODUCTS[randomInt(random, 0, PRODUCTS.length - 1)] ?? "Everyday Tote";
    const cancelled = random() < 0.03;
    orders.push({
      order_key: `${storeId}-${number}`,
      order_name: channel === "Amazon" ? `112-${String(number).padStart(7, "0")}` : `#${number}`,
      order_number: String(number),
      order_created_at: String(instantMicros),
      order_created_at_local_datetime: new Date(localMs).toISOString().slice(0, 19),
      sm_channel: channel,
      sm_sub_channel: subChannel,
      sm_order_type: random() < 0.35 ? "repeat" : "first",
      order_payment_status: cancelled ? "voided" : "paid",
      order_cart_quantity: String(items),
      order_id: String(5_000_000_000 + number),
      order_processed_at: String(instantMicros + 60_000_000n),
      order_cancelled_at: cancelled ? String(instantMicros + 3_600_000_000n) : null,
      order_cancellation_reason: cancelled ? "customer" : null,
      sm_order_sales_channel: channel === "Amazon" ? "Amazon" : "Online Store",
      source_system: channel === "Amazon" ? "amazon" : "shopify",
      order_currency_code: "USD",
      order_refund_quantity: random() < 0.05 ? "1" : "0",
      order_shipping_country: country,
      order_shipping_state: state,
      sm_utm_source: subChannel === "Paid Social" ? "meta" : subChannel === "Email" ? "klaviyo" : null,
      sm_utm_medium: subChannel === "Paid Social" ? "paid_social" : subChannel === "Email" ? "email" : null,
      sm_utm_campaign: subChannel === "Paid Social" ? "prospecting_broad" : null,
      order_discount_codes_csv: random() < 0.2 ? "WELCOME10" : null,
      order_product_titles_csv: items > 1 ? `${product}, Travel Pouch` : product,
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

/** Newest first, then by key, the same order the live query uses. */
function compareNewestFirst(a: WireOrder, b: WireOrder): number {
  const at = BigInt(a.order_created_at ?? "0");
  const bt = BigInt(b.order_created_at ?? "0");
  if (at !== bt) return at > bt ? -1 : 1;
  return (b.order_key ?? "").localeCompare(a.order_key ?? "");
}

function isAfterCursor(order: WireOrder, cursor: OrderCursor): boolean {
  const created = BigInt(order.order_created_at ?? "0");
  return (
    created < cursor.createdAtMicros || (created === cursor.createdAtMicros && (order.order_key ?? "") < cursor.key)
  );
}

export async function sampleOrders(filters: OrdersFilters): Promise<OrdersPage> {
  const rows = datesInRange(filters.range)
    .flatMap((date) => ordersForDay(filters.storeId, date))
    .filter((order) => !filters.search || matchesSearch(order, filters.search))
    .filter((order) => !filters.cursor || isAfterCursor(order, filters.cursor))
    .sort(compareNewestFirst)
    .slice(0, PAGE_SIZE + 1);
  const orders = decodeRows(OrderSummaryRow, rows, ORDERS_RELATION).map(toOrderSummary);
  const page = orders.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    orders: page,
    nextCursor: orders.length > PAGE_SIZE && last ? { createdAtMicros: last.createdAt.micros, key: last.key } : null,
  };
}

export async function sampleOrderDetail(storeId: string, ref: OrderCursor): Promise<OrderDetail | null> {
  // The local date is within a day of the instant; check both neighbours.
  const instantDate = new Date(Number(ref.createdAtMicros / 1000n)).toISOString().slice(0, 10);
  const candidates = [addDays(instantDate, -1), instantDate].flatMap((date) => ordersForDay(storeId, date));
  const match = candidates.find(
    (order) => order.order_key === ref.key && order.order_created_at === String(ref.createdAtMicros),
  );
  if (!match) return null;
  const [row] = decodeRows(OrderDetailRow, [match], ORDERS_RELATION);
  return row ? toOrderDetail(row) : null;
}
