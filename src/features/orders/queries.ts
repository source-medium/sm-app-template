/**
 * Orders' data contract, from obt_orders (one row per order). Orders are
 * listed by when they were processed, in store-local time
 * (order_processed_at_local_datetime): SourceMedium partitions obt_orders on
 * that column, so the date filter prunes partitions instead of scanning
 * every order. Pages are keyset-paginated in SQL (newest first, then by
 * order key) because a BigQuery page token cannot span requests. Search is a
 * bounded, parameterized match on the order name, number, or id. Money is in
 * the warehouse's reporting currency.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { Instant } from "@/lib/data/decode";
import type { ReportFilters } from "@/lib/filters";
import { queryOrderDetail, queryOrders } from "./bigquery";
import { sampleOrderDetail, sampleOrders } from "./sample";

export const PAGE_SIZE = 25;

/** A position in the list, or one order: its processed wall time and its key. */
export type OrderRef = { processedLocal: string; key: string };

export type OrderSummary = {
  key: string;
  name: string | null;
  /** Store-local wall time as published (DATETIME), such as "2026-10-04T13:22:11". */
  processedLocal: string;
  channel: string | null;
  subChannel: string | null;
  orderType: string | null;
  paymentStatus: string | null;
  /** NUMERIC, exact decimal text. */
  items: string | null;
  /** NUMERIC, exact decimal text. */
  netRevenue: string | null;
};

export type OrderDetail = OrderSummary & {
  orderId: string | null;
  createdAt: Instant | null;
  cancelledAt: Instant | null;
  cancellationReason: string | null;
  salesChannel: string | null;
  sourceSystem: string | null;
  refundedItems: string | null;
  grossRevenue: string | null;
  discounts: string | null;
  refunds: string | null;
  shipping: string | null;
  taxes: string | null;
  totalRevenue: string | null;
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

export type OrdersFilters = ReportFilters & { search: string | null; cursor: OrderRef | null };
export type OrdersPage = { orders: OrderSummary[]; nextCursor: OrderRef | null };

export async function getOrders(filters: OrdersFilters): Promise<OrdersPage> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryOrders(filters) : sampleOrders(filters);
}

/** One order by key and processed time; the time lets BigQuery prune to one partition. */
export async function getOrderDetail(storeId: string, ref: OrderRef): Promise<OrderDetail | null> {
  const access = await requireViewer({ storeId });
  return access.mode === "live" ? queryOrderDetail(storeId, ref) : sampleOrderDetail(storeId, ref);
}

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;

/** An order reference as base64url JSON for the URL. */
export function encodeRef(ref: OrderRef): string {
  const json = JSON.stringify([ref.processedLocal, ref.key]);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Anything malformed is ignored (null), which starts from the first page or closes the drawer. */
export function decodeRef(value: string | undefined): OrderRef | null {
  if (!value || value.length > 400) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const json: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
    if (!Array.isArray(json) || json.length !== 2) return null;
    const [processedLocal, key] = json as unknown[];
    if (typeof processedLocal !== "string" || !DATETIME.test(processedLocal)) return null;
    if (typeof key !== "string" || key.length === 0 || key.length > 200) return null;
    return { processedLocal, key };
  } catch {
    return null;
  }
}
