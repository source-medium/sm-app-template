import { z } from "zod";
import { bq } from "@/lib/data/decode";
import { periodCoverageFields, periodFields } from "@/lib/data/period-sql";
import { safeImageUrl } from "@/lib/image-url";

export const PRODUCTS_RELATION = "obt_order_lines";
export const PRODUCT_IMAGES_RELATION = "dim_product_variants";
export const ProductImageRow = z.object({
  product_key: bq.string(),
  image_url: bq.string().nullable().transform(safeImageUrl),
});
export const ProductChannelRow = z.object({ channel: bq.string() });
/** The ranked chart's rows. */
export const MAX_PRODUCTS = 10;
/** The explorer table: rows per page, and the most rows it pages through or exports. */
export const PRODUCT_PAGE_SIZE = 50;
export const MAX_PRODUCT_ROWS = 500;
/** At most this many characters of a product search. */
export const MAX_PRODUCT_SEARCH = 200;
/** Each measure `queryProducts` sums per period and totals across the ranked set. */
export const PRODUCT_MEASURES = ["revenue", "units", "profit", "refunds", "refunded_units"] as const;
export type ProductMeasure = (typeof PRODUCT_MEASURES)[number];
const amount = bq.numeric().nullable();
export const ProductRow = z.object({
  product_key: bq.string(),
  label: bq.string(),
  reference: bq.string(),
  // Optional presentation metadata: live financial queries do not depend on the catalog.
  image_url: bq.string().nullable().optional().default(null).transform(safeImageUrl),
  ...periodFields(PRODUCT_MEASURES, amount),
  ...periodFields(PRODUCT_MEASURES, amount, "total_"),
  minimum_value: amount,
  /** Ranked products that match the search, before paging. */
  matched_count: bq.int64(),
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
