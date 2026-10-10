import { z } from "zod";
import { bq } from "@/lib/data/decode";

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
  minimum_value: amount,
  /** Each period's latest date with valid lines, for comparison coverage. */
  latest_date: bq.date().nullable(),
  previous_latest_date: bq.date().nullable(),
});
export type Product = z.output<typeof ProductRow>;
