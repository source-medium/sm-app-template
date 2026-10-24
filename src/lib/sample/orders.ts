import { fromUnits } from "@/lib/data/decimal";
import { randomInt, seededRandom } from "./random";
import { SAMPLE_STORE_SCALE } from "./stores";

const EPOCH_DAY = Date.parse("2024-01-01T00:00:00Z") / 86_400_000;
/** Sample stores report in UTC-5, so local wall time is five hours behind the instant. */
const OFFSET_MS = 5 * 3_600_000;
const CHANNELS = [
  ["online_dtc", "Paid Social"],
  ["online_dtc", "Organic Search"],
  ["online_dtc", "Email"],
  ["online_dtc", "Direct"],
  ["amazon", "Marketplace"],
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

export type WireOrder = Record<string, string | null>;
const money = (cents: number) => fromUnits(BigInt(cents) * 10_000_000n);

export function sampleOrderRowsForDay(storeId: string, date: string): WireOrder[] {
  const scale = SAMPLE_STORE_SCALE.get(storeId) ?? 0;
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
      order_name: channel === "amazon" ? `112-${String(number).padStart(7, "0")}` : `#${number}`,
      order_number: String(number),
      order_created_at_local_datetime: new Date(createdLocalMs).toISOString().slice(0, 19),
      order_shipping_country_code: country === "United States" ? "US" : "CA",
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
      sm_order_sales_channel: channel === "amazon" ? "Amazon" : "Online Store",
      source_system: channel === "amazon" ? "amazon" : "shopify",
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
