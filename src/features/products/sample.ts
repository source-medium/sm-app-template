import { matchesSalesChannel } from "@/lib/filters";
import { decodeRows } from "@/lib/data/decode";
import { fromUnits, sumDecimals, toUnits } from "@/lib/data/decimal";
import { datesInRange, latestDate, type ReportFilters, type DateRange } from "@/lib/filters";
import { seededRandom, randomInt } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { countedSales, sampleSummarySource } from "@/lib/sample/executive-summary";
import type { ProductFilters, ProductsData } from "./queries";
import { periodColumns } from "@/lib/data/period-sql";
import {
  MAX_PRODUCTS,
  PRODUCT_MEASURES,
  PRODUCTS_RELATION,
  ProductRow,
  type ProductCoverage,
  type ProductMeasure,
} from "./rows";
import type { BaselineRanges } from "@/lib/comparison";

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
  imageUrl?: string | null;
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
const money = (cents: bigint) => fromUnits(cents * 10_000_000n);
const percent = (cents: bigint, share: bigint) => (cents * share) / 100n;

/**
 * Split whole cents across weights so the parts sum exactly to the total:
 * floor shares, then one cent each to the largest remainders.
 */
function allocate(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) return weights.map(() => 0n);
  const parts = weights.map((weight) => (total * weight) / sum);
  let left = total - parts.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((weight, index) => ({ index, remainder: (total * weight) % sum }))
    .sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : a.index - b.index));
  for (const { index } of order) {
    if (left === 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    left -= 1n;
  }
  return parts;
}

/**
 * Order lines for one store. Each day's lines split that day's order net
 * revenue for their sales channel, from the summary sample every other view
 * reads, so Products and Overview agree for the same store, dates and
 * channel. A day or channel with no orders has no lines.
 */
export function sampleProductSource(storeId: string, range: DateRange): ProductSource[] {
  const scale = SAMPLE_STORE_SCALE.get(storeId);
  if (!scale) return [];
  const orderRevenue = new Map<string, bigint>();
  for (const row of sampleSummarySource(storeId, range).map(countedSales)) {
    const key = `${row.date}|${row.sm_channel}`;
    orderRevenue.set(key, (orderRevenue.get(key) ?? 0n) + row.order_net_revenue_cents);
  }
  return datesInRange(range).flatMap((date) => {
    const lines = TITLES.flatMap((title, index) =>
      ["Standard", "Large"].map((variant, v) => {
        const random = seededRandom(`product|${storeId}|${date}|${index}|${v}`);
        const units = Math.round(randomInt(random, 2, 35) * scale * 2) / 2;
        const weight = BigInt(Math.round(units * (1200 + index * 185 + v * 900)));
        return { title, index, variant, v, units, weight, channel: index % 3 === 0 ? "amazon" : "online_dtc" };
      }),
    );
    return [...new Set(lines.map((line) => line.channel))].flatMap((channel) => {
      const revenue = orderRevenue.get(`${date}|${channel}`) ?? 0n;
      if (revenue <= 0n) return [];
      const members = lines.filter((line) => line.channel === channel);
      const amounts = allocate(
        revenue,
        members.map((line) => line.weight),
      );
      return members.map(({ title, index, variant, v, units }, line) => {
        const amount = amounts[line] ?? 0n;
        return {
          storeId,
          orderLineId: `${storeId}|${date}|p${index + 1}-v${v + 1}`,
          date,
          valid: true,
          channel,
          source: channel === "amazon" ? "amazon" : "shopify",
          productId: `p${index + 1}`,
          variantId: `p${index + 1}-v${v + 1}`,
          title,
          imageUrl:
            title === "Shaker"
              ? "/sample-products/shaker.webp"
              : /kit|set|box/i.test(title)
                ? "/sample-products/gift-set.webp"
                : /blend|pack/i.test(title)
                  ? "/sample-products/blend-pouch.webp"
                  : null,
          variant,
          revenue: money(amount),
          units: String(units),
          profit: index === 5 ? null : index === 8 ? money(amount) : money(percent(amount, 58n)),
          refunds: money(index % 4 === 0 ? -1200n : 0n),
          refunded_units: index % 4 === 0 ? "-1" : "0",
          ordered_units: String(units + (index % 4 === 0 ? 1 : 0)),
          cost: index === 5 ? null : index === 8 ? "0" : money(percent(amount, 42n)),
        };
      });
    });
  });
}

/** Source-grain fixture aggregation: exact sums before ranking, like the live query. */
export function aggregateProducts(
  source: ProductSource[],
  filters: ProductFilters,
  baselines: BaselineRanges,
): ProductsData {
  const [baseline, second] = baselines;
  const groups = new Map<string, ProductSource[]>();
  const inRange = (date: string, range: DateRange | null) => range !== null && date >= range.from && date <= range.to;
  for (const row of source) {
    if (
      row.storeId !== filters.storeId ||
      !row.valid ||
      !matchesSalesChannel(filters.channel, row.channel) ||
      (!inRange(row.date, filters.range) && !inRange(row.date, baseline) && !inRange(row.date, second))
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
    const sum = (metric: ProductMeasure, range: DateRange | null) =>
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
      image_url:
        group
          .filter((row) => row.imageUrl)
          .sort((a, b) => b.date.localeCompare(a.date) || (b.imageUrl ?? "").localeCompare(a.imageUrl ?? ""))[0]
          ?.imageUrl ?? null,
      ...(Object.fromEntries(
        PRODUCT_MEASURES.flatMap((metric) => [
          [metric, sum(metric, filters.range)],
          [`previous_${metric}`, sum(metric, baseline)],
          [`second_${metric}`, sum(metric, second)],
        ]),
      ) as Record<ProductMeasure | `previous_${ProductMeasure}` | `second_${ProductMeasure}`, string | null>),
    };
  });
  const latest = (range: DateRange | null) =>
    latestDate([...groups.values()].flat().flatMap((row) => (inRange(row.date, range) ? [row.date] : [])));
  const coverage = {
    latest_date: latest(filters.range),
    previous_latest_date: latest(baseline),
    second_latest_date: latest(second),
  };
  const amounts = rows.flatMap((row) => (row[filters.metric] === null ? [] : [toUnits(row[filters.metric] as string)]));
  const minimum = amounts.length ? fromUnits(amounts.reduce((a, b) => (a < b ? a : b))) : null;
  const totals = Object.fromEntries(
    periodColumns(PRODUCT_MEASURES).map((column) => [`total_${column}`, sumDecimals(rows.map((row) => row[column]))]),
  );
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
  // As live: products with no value in the selected period are not ranked.
  const ranked = rows.filter((row) => row[filters.metric] !== null);
  return {
    rows: decodeRows(
      ProductRow,
      ranked.slice(0, MAX_PRODUCTS).map((row) => ({ ...row, ...totals, ...coverage, minimum_value: minimum })),
      PRODUCTS_RELATION,
    ),
    hasMore: ranked.length > MAX_PRODUCTS,
  };
}

export function sampleProducts(filters: ProductFilters, baselines: BaselineRanges): ProductsData {
  // Deduplicate overlapping date ranges before generating source rows.
  const dates = new Set([
    ...datesInRange(filters.range),
    ...baselines.flatMap((baseline) => (baseline ? datesInRange(baseline) : [])),
  ]);
  return aggregateProducts(
    [...dates].flatMap((date) => sampleProductSource(filters.storeId, { from: date, to: date })),
    filters,
    baselines,
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
