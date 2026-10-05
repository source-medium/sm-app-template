import { z } from "zod";
import { bq } from "@/lib/data/decode";
import type { OrderDetail, OrderSummary } from "./queries";

export const ORDERS_RELATION = "obt_orders";

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;

export const SUMMARY_COLUMNS = `
  sm_order_key AS order_key,
  order_name,
  order_created_at,
  order_created_at_local_datetime,
  sm_channel,
  sm_sub_channel,
  sm_order_type,
  order_payment_status,
  order_cart_quantity`;

export const OrderSummaryRow = z.object({
  order_key: bq.string(),
  order_name: bq.string().nullable(),
  order_created_at: bq.timestamp(),
  order_created_at_local_datetime: bq.string().regex(DATETIME).nullable(),
  sm_channel: bq.string().nullable(),
  sm_sub_channel: bq.string().nullable(),
  sm_order_type: bq.string().nullable(),
  order_payment_status: bq.string().nullable(),
  order_cart_quantity: bq.numeric().nullable(),
});

export const DETAIL_COLUMNS = `${SUMMARY_COLUMNS},
  order_id,
  order_processed_at,
  order_cancelled_at,
  order_cancellation_reason,
  sm_order_sales_channel,
  source_system,
  order_currency_code,
  order_refund_quantity,
  order_shipping_country,
  order_shipping_state,
  sm_utm_source,
  sm_utm_medium,
  sm_utm_campaign,
  order_discount_codes_csv,
  order_product_titles_csv,
  order_index,
  is_order_sm_valid`;

export const OrderDetailRow = OrderSummaryRow.extend({
  order_id: bq.string().nullable(),
  order_processed_at: bq.timestamp().nullable(),
  order_cancelled_at: bq.timestamp().nullable(),
  order_cancellation_reason: bq.string().nullable(),
  sm_order_sales_channel: bq.string().nullable(),
  source_system: bq.string().nullable(),
  order_currency_code: bq.string().nullable(),
  order_refund_quantity: bq.numeric().nullable(),
  order_shipping_country: bq.string().nullable(),
  order_shipping_state: bq.string().nullable(),
  sm_utm_source: bq.string().nullable(),
  sm_utm_medium: bq.string().nullable(),
  sm_utm_campaign: bq.string().nullable(),
  order_discount_codes_csv: bq.string().nullable(),
  order_product_titles_csv: bq.string().nullable(),
  order_index: bq.int64().nullable(),
  is_order_sm_valid: bq.bool().nullable(),
});

export function toOrderSummary(row: z.output<typeof OrderSummaryRow>): OrderSummary {
  return {
    key: row.order_key,
    name: row.order_name,
    createdAt: row.order_created_at,
    createdLocal: row.order_created_at_local_datetime,
    channel: row.sm_channel,
    subChannel: row.sm_sub_channel,
    orderType: row.sm_order_type,
    paymentStatus: row.order_payment_status,
    items: row.order_cart_quantity,
  };
}

export function toOrderDetail(row: z.output<typeof OrderDetailRow>): OrderDetail {
  return {
    ...toOrderSummary(row),
    orderId: row.order_id,
    processedAt: row.order_processed_at,
    cancelledAt: row.order_cancelled_at,
    cancellationReason: row.order_cancellation_reason,
    salesChannel: row.sm_order_sales_channel,
    sourceSystem: row.source_system,
    currencyCode: row.order_currency_code,
    refundedItems: row.order_refund_quantity,
    shippingCountry: row.order_shipping_country,
    shippingState: row.order_shipping_state,
    utmSource: row.sm_utm_source,
    utmMedium: row.sm_utm_medium,
    utmCampaign: row.sm_utm_campaign,
    discountCodes: row.order_discount_codes_csv,
    productTitles: row.order_product_titles_csv,
    customerOrderIndex: row.order_index,
    isValidOrder: row.is_order_sm_valid,
  };
}
