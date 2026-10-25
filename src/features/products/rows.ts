import { z } from "zod";
import { bq } from "@/lib/data/decode";
import { periodCoverageFields, periodFields } from "@/lib/data/period-sql";

export const PRODUCTS_RELATION = "obt_order_lines";
export const ProductChannelRow = z.object({ channel: bq.string() });
export const MAX_PRODUCTS = 10;
/** Each measure `queryProducts` sums per period and totals across the ranked set. */
export const PRODUCT_MEASURES = ["revenue", "units", "profit", "refunds", "refunded_units"] as const;
export type ProductMeasure = (typeof PRODUCT_MEASURES)[number];
const amount = bq.numeric().nullable();
export const ProductRow = z.object({
  product_key: bq.string(),
  label: bq.string(),
  reference: bq.string(),
  ...periodFields(PRODUCT_MEASURES, amount),
  ...periodFields(PRODUCT_MEASURES, amount, "total_"),
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
