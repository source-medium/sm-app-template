import { matchesSalesChannel } from "@/lib/filters";
import { decodeRows } from "@/lib/data/decode";
import { fromUnits, sumDecimals, toUnits } from "@/lib/data/decimal";
import { datesInRange, latestDate, type ReportFilters, type DateRange } from "@/lib/filters";
import { seededRandom, randomInt } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import type { ProductFilters, ProductsData } from "./queries";
import { MAX_PRODUCTS, PRODUCTS_RELATION, ProductRow, type ProductCoverage } from "./rows";

const MEASURES = ["revenue", "units", "profit", "refunds", "refunded_units"] as const;
type Measure = (typeof MEASURES)[number];

export type ProductSource = {
  storeId: string;
  orderLineId: string | null;
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
  refunds: string | null;
  refunded_units: string | null;
  ordered_units: string | null;
  cost: string | null;
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
          orderLineId: `${storeId}|${date}|p${index + 1}-v${v + 1}`,
          date,
          valid: true,
          channel: index % 3 === 0 ? "amazon" : "online_dtc",
          source: index % 3 === 0 ? "amazon" : "shopify",
          productId: `p${index + 1}`,
          variantId: `p${index + 1}-v${v + 1}`,
          title,
          variant,
          revenue: money(revenue),
          units: String(units),
          profit: index === 5 ? null : index === 8 ? money(revenue) : money(Math.round(revenue * 0.58)),
          refunds: money(index % 4 === 0 ? -1200 : 0),
          refunded_units: index % 4 === 0 ? "-1" : "0",
          ordered_units: String(units + (index % 4 === 0 ? 1 : 0)),
          cost: index === 5 ? null : index === 8 ? "0" : money(Math.round(revenue * 0.42)),
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
      !matchesSalesChannel(filters.channel, row.channel) ||
      (!inRange(row.date, filters.range) && !inRange(row.date, baseline))
    )
      continue;
    const key = JSON.stringify([
      row.source,
      row.productId,
      ...(filters.dimension === "variant" ? [row.variantId] : []),
    ]);
    if (filters.entity && key !== filters.entity) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const rows = [...groups].map(([key, group]) => {
    const label = (row: ProductSource) =>
      filters.dimension === "product" ? row.title : `${row.title} / ${row.variant}`;
    const first = group.slice().sort((a, b) => b.date.localeCompare(a.date) || label(b).localeCompare(label(a)))[0];
    if (!first) throw new Error("Product group must contain a row");
    const sum = (metric: Measure, range: DateRange | null) =>
      sumDecimals(
        group
          .filter((row) => inRange(row.date, range))
          .map((row) => {
            if (metric === "refunds" || metric === "refunded_units")
              return row[metric] === null ? null : fromUnits(-toUnits(row[metric]));
            return row[metric];
          }),
      );
    return {
      product_key: key,
      label: label(first),
      reference: `${first.source} / ${filters.dimension === "product" ? first.productId : first.variantId}`,
      ...(Object.fromEntries(
        MEASURES.flatMap((metric) => [
          [metric, sum(metric, filters.range)],
          [`previous_${metric}`, sum(metric, baseline)],
        ]),
      ) as Record<Measure | `previous_${Measure}`, string | null>),
    };
  });
  const latest = (range: DateRange | null) =>
    latestDate([...groups.values()].flat().flatMap((row) => (inRange(row.date, range) ? [row.date] : [])));
  const coverage = { latest_date: latest(filters.range), previous_latest_date: latest(baseline) };
  const amounts = rows.flatMap((row) => (row[filters.metric] === null ? [] : [toUnits(row[filters.metric] as string)]));
  const minimum = amounts.length ? fromUnits(amounts.reduce((a, b) => (a < b ? a : b))) : null;
  const totals = {
    ...Object.fromEntries(
      MEASURES.flatMap((metric) => [
        [`total_${metric}`, sumDecimals(rows.map((row) => row[metric]))],
        [`total_previous_${metric}`, sumDecimals(rows.map((row) => row[`previous_${metric}`]))],
      ]),
    ),
  };
  rows.sort((a, b) => {
    const amount = (row: typeof a) => {
      const current = row[filters.metric],
        previous = row[`previous_${filters.metric}`];
      return filters.ranking && filters.ranking !== "value"
        ? current === null || previous === null
          ? null
          : fromUnits(toUnits(current) - toUnits(previous))
        : current;
    };
    const left = amount(a),
      right = amount(b);
    if (left === null || right === null)
      return left === right ? a.product_key.localeCompare(b.product_key) : left === null ? 1 : -1;
    const diff = (toUnits(right) - toUnits(left)) * (filters.ranking === "decliners" ? -1n : 1n);
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

export function aggregateProductCoverage(
  source: ProductSource[],
  filters: ReportFilters & Partial<Pick<ProductFilters, "channel" | "entity" | "dimension">>,
): ProductCoverage {
  const rows = source.filter(
    (row) =>
      row.storeId === filters.storeId &&
      row.valid &&
      row.date >= filters.range.from &&
      row.date <= filters.range.to &&
      matchesSalesChannel(filters.channel, row.channel) &&
      (!filters.entity ||
        JSON.stringify([row.source, row.productId, ...(filters.dimension === "variant" ? [row.variantId] : [])]) ===
          filters.entity),
  );
  const productLines = rows.filter((row) => row.orderLineId !== null);
  return {
    lines: BigInt(productLines.length),
    missing_cost_lines: BigInt(productLines.filter((row) => row.cost === null).length),
    zero_cost_lines: BigInt(productLines.filter((row) => row.cost !== null && toUnits(row.cost) === 0n).length),
    ordered_units: sumDecimals(rows.map((row) => row.ordered_units)),
    refunded_units: sumDecimals(
      rows.map((row) => (row.refunded_units === null ? null : fromUnits(-toUnits(row.refunded_units)))),
    ),
  };
}
