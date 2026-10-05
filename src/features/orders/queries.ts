/**
 * Orders' data contract, from obt_orders (one row per order). Pages are
 * keyset-paginated in SQL (newest first, then by order key) because a
 * BigQuery page token lives inside one job and cannot span requests.
 * Search is a bounded, parameterized match on the order name, number, or id.
 *
 * Monetary columns stay out until a reporting currency is verified
 * (docs/data.md, "Money and currency").
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { Instant } from "@/lib/data/decode";
import type { ReportFilters } from "@/lib/filters";
import { queryOrderDetail, queryOrders } from "./bigquery";
import { sampleOrderDetail, sampleOrders } from "./sample";

export const PAGE_SIZE = 25;

export type OrderCursor = { createdAtMicros: bigint; key: string };

export type OrderSummary = {
  key: string;
  name: string | null;
  createdAt: Instant;
  /** Store-local wall time as published (DATETIME), such as "2026-10-04T13:22:11". */
  createdLocal: string | null;
  channel: string | null;
  subChannel: string | null;
  orderType: string | null;
  paymentStatus: string | null;
  /** NUMERIC, exact decimal text. */
  items: string | null;
};

export type OrderDetail = OrderSummary & {
  orderId: string | null;
  processedAt: Instant | null;
  cancelledAt: Instant | null;
  cancellationReason: string | null;
  salesChannel: string | null;
  sourceSystem: string | null;
  currencyCode: string | null;
  refundedItems: string | null;
  shippingCountry: string | null;
  shippingState: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  discountCodes: string | null;
  productTitles: string | null;
  customerOrderIndex: bigint | null;
  isValidOrder: boolean | null;
};

export type OrdersFilters = ReportFilters & { search: string | null; cursor: OrderCursor | null };
export type OrdersPage = { orders: OrderSummary[]; nextCursor: OrderCursor | null };

export async function getOrders(filters: OrdersFilters): Promise<OrdersPage> {
  const access = await requireViewer();
  return access.mode === "live" ? queryOrders(filters) : sampleOrders(filters);
}

/** One order by key and creation time; the time lets BigQuery prune instead of scanning every order. */
export async function getOrderDetail(storeId: string, ref: OrderCursor): Promise<OrderDetail | null> {
  const access = await requireViewer();
  return access.mode === "live" ? queryOrderDetail(storeId, ref) : sampleOrderDetail(storeId, ref);
}

/**
 * A position in the list (the page cursor) or one order (the drawer), as
 * base64url JSON in the URL. Anything malformed is ignored.
 */
export function encodeCursor(cursor: OrderCursor): string {
  const json = JSON.stringify([cursor.createdAtMicros.toString(), cursor.key]);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(value: string | undefined): OrderCursor | null {
  if (!value || value.length > 400) return null;
  try {
    const json: unknown = JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/")));
    if (!Array.isArray(json) || json.length !== 2) return null;
    const [micros, key] = json as unknown[];
    if (typeof micros !== "string" || !/^-?\d{1,19}$/.test(micros) || typeof key !== "string" || key.length > 200)
      return null;
    return { createdAtMicros: BigInt(micros), key };
  } catch {
    return null;
  }
}
