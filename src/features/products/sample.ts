import { decodeRows } from "@/lib/data/decode";
import { fromUnits, sumDecimals, toUnits } from "@/lib/data/decimal";
import { datesInRange, latestDate, type DateRange } from "@/lib/filters";
import { seededRandom, randomInt } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import type { ProductFilters, ProductsData } from "./queries";
import { MAX_PRODUCTS, PRODUCTS_RELATION, ProductRow } from "./rows";

export type ProductSource = {
  storeId: string;
  date: string;
  valid: boolean;
  channel: string | null;
  source: string;
  productId: string;
  variantId: string;
  title: string;
  variant: string;
  revenue: string | null;
  units: string | null;
  profit: string | null;
};
const TITLES = [
  "Daily blend",
  "Evening blend",
  "Starter kit",
  "Travel pouch",
  "Refill pack",
  "Discovery set",
  "Measuring spoon",
  "Gift box",
  "Shaker",
  "Daily blend",
  "Seasonal blend",
  "Sample pack",
];
const money = (cents: number) => fromUnits(BigInt(cents) * 10_000_000n);

export function sampleProductSource(storeId: string, range: DateRange): ProductSource[] {
  const scale = SAMPLE_STORE_SCALE.get(storeId);
  if (!scale) return [];
  return datesInRange(range).flatMap((date) =>
    TITLES.flatMap((title, index) =>
      ["Standard", "Large"].map((variant, v) => {
        const random = seededRandom(`product|${storeId}|${date}|${index}|${v}`);
        const units = Math.round(randomInt(random, 2, 35) * scale * 2) / 2;
        const revenue = Math.round(units * (1200 + index * 185 + v * 900));
        return {
          storeId,
          date,
          valid: true,
          channel: index % 3 === 0 ? "Amazon" : "Online DTC",
          source: index % 3 === 0 ? "amazon" : "shopify",
          productId: `p${index + 1}`,
          variantId: `p${index + 1}-v${v + 1}`,
          title,
          variant,
          revenue: money(revenue),
          units: String(units),
          profit: money(Math.round(revenue * 0.58)),
        };
      }),
    ),
  );
}

/** Source-grain fixture aggregation: exact sums before ranking, like the live query. */
export function aggregateProducts(
  source: ProductSource[],
  filters: ProductFilters,
  baseline: DateRange | null,
): ProductsData {
  const groups = new Map<string, ProductSource[]>();
  const inRange = (date: string, range: DateRange | null) => range !== null && date >= range.from && date <= range.to;
  for (const row of source) {
    if (
      row.storeId !== filters.storeId ||
      !row.valid ||
      (Boolean(filters.channel) && (row.channel ?? "(none)") !== filters.channel) ||
      (!inRange(row.date, filters.range) && !inRange(row.date, baseline))
    )
      continue;
    const key = JSON.stringify([
      row.source,
      row.productId,
      ...(filters.dimension === "variant" ? [row.variantId] : []),
    ]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const rows = [...groups].map(([key, group]) => {
    const first = group.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!first) throw new Error("Product group must contain a row");
    const sum = (metric: "revenue" | "units" | "profit", range: DateRange | null) =>
      sumDecimals(group.filter((row) => inRange(row.date, range)).map((row) => row[metric]));
    return {
      product_key: key,
      label: filters.dimension === "product" ? first.title : `${first.title} / ${first.variant}`,
      reference: `${first.source} / ${filters.dimension === "product" ? first.productId : first.variantId}`,
      revenue: sum("revenue", filters.range),
      units: sum("units", filters.range),
      profit: sum("profit", filters.range),
      previous_revenue: sum("revenue", baseline),
      previous_units: sum("units", baseline),
      previous_profit: sum("profit", baseline),
    };
  });
  const latest = (range: DateRange | null) =>
    latestDate([...groups.values()].flat().flatMap((row) => (inRange(row.date, range) ? [row.date] : [])));
  const coverage = { latest_date: latest(filters.range), previous_latest_date: latest(baseline) };
  const amounts = rows.flatMap((row) => (row[filters.metric] === null ? [] : [toUnits(row[filters.metric] as string)]));
  const minimum = amounts.length ? fromUnits(amounts.reduce((a, b) => (a < b ? a : b))) : null;
  const totals = {
    total_revenue: sumDecimals(rows.map((row) => row.revenue)),
    total_units: sumDecimals(rows.map((row) => row.units)),
    total_profit: sumDecimals(rows.map((row) => row.profit)),
    total_previous_revenue: sumDecimals(rows.map((row) => row.previous_revenue)),
    total_previous_units: sumDecimals(rows.map((row) => row.previous_units)),
    total_previous_profit: sumDecimals(rows.map((row) => row.previous_profit)),
  };
  rows.sort((a, b) => {
    const left = a[filters.metric],
      right = b[filters.metric];
    if (left === null || right === null)
      return left === right ? a.product_key.localeCompare(b.product_key) : left === null ? 1 : -1;
    const diff = toUnits(right) - toUnits(left);
    return diff > 0n ? 1 : diff < 0n ? -1 : a.product_key.localeCompare(b.product_key);
  });
  return {
    rows: decodeRows(
      ProductRow,
      rows.slice(0, MAX_PRODUCTS).map((row) => ({ ...row, ...totals, ...coverage, minimum_value: minimum })),
      PRODUCTS_RELATION,
    ),
    hasMore: rows.length > MAX_PRODUCTS,
  };
}

export function sampleProducts(filters: ProductFilters, baseline: DateRange | null): ProductsData {
  // Deduplicate overlapping date ranges before generating source rows.
  const dates = new Set([...datesInRange(filters.range), ...(baseline ? datesInRange(baseline) : [])]);
  return aggregateProducts(
    [...dates].flatMap((date) => sampleProductSource(filters.storeId, { from: date, to: date })),
    filters,
    baseline,
  );
}
