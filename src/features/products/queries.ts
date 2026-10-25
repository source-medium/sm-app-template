import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { parseChoice, single, type ReportFilters, type SearchParams } from "@/lib/filters";
import { queryProductChannels, queryProducts, queryProductCoverage, queryProductImages } from "./bigquery";
import type { Product, ProductCoverage } from "./rows";
import { sampleProductSource, sampleProducts, aggregateProductCoverage } from "./sample";
import type { BaselineRanges } from "@/lib/comparison";
import { WarehouseError } from "@/lib/data/warehouse-error";

export const PRODUCT_DIMENSIONS = [
  { value: "product", label: "Product" },
  { value: "variant", label: "Variant" },
] as const;
export const PRODUCT_METRICS = [
  { value: "revenue", label: "Net revenue" },
  { value: "units", label: "Net units" },
  { value: "profit", label: "Product gross profit" },
  { value: "refunds", label: "Refund amount" },
  { value: "refunded_units", label: "Refunded units" },
] as const;
export type ProductDimension = (typeof PRODUCT_DIMENSIONS)[number]["value"];
export type ProductMetric = (typeof PRODUCT_METRICS)[number]["value"];
export type ProductFilters = ReportFilters & {
  dimension: ProductDimension;
  metric: ProductMetric;
  channel?: string | null;
  entity?: string | null;
  ranking?: "value" | "gainers" | "decliners";
};
export type ProductsData = { rows: Product[]; hasMore: boolean };

export function productOptions(params: SearchParams) {
  return {
    entity: single(params, "entity")?.slice(0, 2000) || null,
    ranking: parseChoice(params, "ranking", ["value", "gainers", "decliners"] as const, "value"),
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

export async function getProducts(filters: ProductFilters, baselines: BaselineRanges): Promise<ProductsData> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryProducts(filters, baselines) : sampleProducts(filters, baselines);
}

/** Photos are optional decoration. Catalog failures remain logged by the warehouse and never hide valid metrics. */
export async function getProductImages(filters: Pick<ProductFilters, "storeId" | "dimension">, products: Product[]) {
  const access = await requireViewer({ storeId: filters.storeId });
  if (access.mode === "sample") return new Map(products.map((row) => [row.product_key, row.image_url]));
  try {
    return await queryProductImages(
      filters,
      products.map((row) => row.product_key),
    );
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return new Map<string, string | null>();
  }
}

export async function getProductChannels(filters: ReportFilters): Promise<string[]> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live"
    ? queryProductChannels(filters)
    : [
        ...new Set(
          sampleProductSource(filters.storeId, filters.range)
            .filter((row) => row.valid)
            .map((row) => row.channel ?? "(none)"),
        ),
      ].sort();
}

export async function getProductCoverage(
  filters: ReportFilters & Partial<Pick<ProductFilters, "channel" | "entity" | "dimension">>,
): Promise<ProductCoverage> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live"
    ? queryProductCoverage(filters)
    : aggregateProductCoverage(sampleProductSource(filters.storeId, filters.range), filters);
}
