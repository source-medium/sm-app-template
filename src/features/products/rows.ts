import { z } from "zod";
import { bq } from "@/lib/data/decode";
import { periodCoverageFields } from "@/lib/data/period-sql";

export const PRODUCTS_RELATION = "obt_order_lines";
export const ProductChannelRow = z.object({ channel: bq.string() });
export const MAX_PRODUCTS = 10;
const amount = bq.numeric().nullable();
export const ProductRow = z.object({
  product_key: bq.string(),
  label: bq.string(),
  reference: bq.string(),
  revenue: amount,
  units: amount,
  profit: amount,
  previous_revenue: amount,
  previous_units: amount,
  previous_profit: amount,
  total_revenue: amount,
  total_units: amount,
  total_profit: amount,
  total_previous_revenue: amount,
  total_previous_units: amount,
  total_previous_profit: amount,
  refunds: amount,
  refunded_units: amount,
  previous_refunds: amount,
  previous_refunded_units: amount,
  total_refunds: amount,
  total_refunded_units: amount,
  total_previous_refunds: amount,
  total_previous_refunded_units: amount,
  minimum_value: amount,
  ...periodCoverageFields,
});
export type Product = z.output<typeof ProductRow>;

export const ProductCoverageRow = z.object({
  lines: bq.int64(),
  missing_cost_lines: bq.int64(),
  zero_cost_lines: bq.int64(),
  ordered_units: amount,
  refunded_units: amount,
});
export type ProductCoverage = z.output<typeof ProductCoverageRow>;
