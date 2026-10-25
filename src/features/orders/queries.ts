/**
 * Orders' data contract, from obt_orders (one row per order). Orders are
 * listed by processed store-local time by default. Explicit processed uses
 * the canonical created-time fallback; explicit created uses created local time.
 * Only the default processed-only query prunes the processed partition directly. Pages are keyset-paginated in SQL (newest first, then by
 * order key) because a BigQuery page token cannot span requests. Search is a
 * bounded, parameterized match on the order name, number, or id. Money is in
 * the warehouse's reporting currency.
 */
import "server-only";
import type { OrderAttribution } from "./attribution";
import type { OrderDateBasis } from "@/lib/order-scope";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { Instant } from "@/lib/data/decode";
import { parseSalesChannel, single, type ReportFilters, type SearchParams } from "@/lib/filters";
import { parseShippingDestination } from "@/lib/shipping-geography";
import { queryOrderAttribution, queryOrderChannels, queryOrderDetail, queryOrders } from "./bigquery";
import { sampleOrderAttribution, sampleOrderChannels, sampleOrderDetail, sampleOrders } from "./sample";

export const PAGE_SIZE = 25;

/** A position in the list, or one order: its processed wall time and its key. */
export type OrderRef = { processedLocal: string; key: string; dateBasis?: OrderDateBasis };

export type OrderSummary = {
  key: string;
  name: string | null;
  /** Store-local wall time as published (DATETIME), such as "2026-10-04T13:22:11". */
  processedLocal: string | null;
  scopeLocal: string;
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

export type OrdersFilters = ReportFilters & {
  search: string | null;
  cursor: OrderRef | null;
  channel?: string | null;
  dateBasis?: OrderDateBasis | null;
  validOnly?: boolean;
  country?: string | null;
  region?: string | null;
};
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
  const json = JSON.stringify(
    ref.dateBasis ? [ref.processedLocal, ref.key, ref.dateBasis] : [ref.processedLocal, ref.key],
  );
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
    if (!Array.isArray(json) || (json.length !== 2 && json.length !== 3)) return null;
    const [processedLocal, key, dateBasis] = json as unknown[];
    if (typeof processedLocal !== "string" || !DATETIME.test(processedLocal)) return null;
    if (typeof key !== "string" || key.length === 0 || key.length > 200) return null;
    if (dateBasis !== undefined && dateBasis !== "created" && dateBasis !== "processed") return null;
    return { processedLocal, key, ...(dateBasis ? { dateBasis } : {}) };
  } catch {
    return null;
  }
}

/** The page's applied scope; an unsupported value names its remedy instead of widening the scope. */
export function ordersOptions(params: SearchParams) {
  const basisParam = single(params, "date_basis");
  const dateBasis: OrderDateBasis | null = basisParam === "created" || basisParam === "processed" ? basisParam : null;
  const population = single(params, "population");
  const validOnly = population === "valid";
  const { country, region } = parseShippingDestination(params);
  const candidateCursor = decodeRef(single(params, "cursor"));
  return {
    search: single(params, "q")?.trim().slice(0, 64) || null,
    channel: parseSalesChannel(params),
    dateBasis,
    validOnly,
    country,
    region,
    scopeIssue:
      (basisParam && !dateBasis ? "Choose a supported date basis." : null) ??
      (region && !country ? "Choose a country before a shipping region." : null) ??
      (population && !validOnly ? "Choose a supported order population." : null),
    // A cursor from another date basis would page a different ordering.
    cursor: (candidateCursor?.dateBasis ?? null) === dateBasis ? candidateCursor : null,
    selected: decodeRef(single(params, "order")),
    evidence: single(params, "evidence") === "attribution" ? ("attribution" as const) : null,
  };
}

export async function getOrderChannels(
  filters: ReportFilters & Pick<OrdersFilters, "dateBasis" | "validOnly" | "country" | "region">,
): Promise<string[]> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryOrderChannels(filters) : sampleOrderChannels(filters);
}

export async function getOrderAttribution(storeId: string, ref: OrderRef): Promise<OrderAttribution> {
  const access = await requireViewer({ storeId });
  if (access.mode === "live") return queryOrderAttribution(storeId, ref.key);
  return sampleOrderAttribution(storeId, ref);
}
