import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { parseChoice, type DateRange, type ReportFilters, type SearchParams } from "@/lib/filters";
import { queryProducts } from "./bigquery";
import type { Product } from "./rows";
import { sampleProducts } from "./sample";

export const PRODUCT_DIMENSIONS = [
  { value: "product", label: "Product" },
  { value: "variant", label: "Variant" },
] as const;
export const PRODUCT_METRICS = [
  { value: "revenue", label: "Net revenue" },
  { value: "units", label: "Net units" },
  { value: "profit", label: "Product gross profit" },
] as const;
export type ProductDimension = (typeof PRODUCT_DIMENSIONS)[number]["value"];
export type ProductMetric = (typeof PRODUCT_METRICS)[number]["value"];
export type ProductFilters = ReportFilters & { dimension: ProductDimension; metric: ProductMetric };
export type ProductsData = { rows: Product[]; hasMore: boolean };

export function productOptions(params: SearchParams) {
  return {
    dimension: parseChoice(
      params,
      "dimension",
      PRODUCT_DIMENSIONS.map((item) => item.value),
      "product",
    ),
    metric: parseChoice(
      params,
      "metric",
      PRODUCT_METRICS.map((item) => item.value),
      "revenue",
    ),
  };
}

export async function getProducts(filters: ProductFilters, baseline: DateRange | null): Promise<ProductsData> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryProducts(filters, baseline) : sampleProducts(filters, baseline);
}
