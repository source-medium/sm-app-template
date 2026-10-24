import { z } from "zod";
import { bq, decodeRows } from "@/lib/data/decode";
import { sumDecimals, toUnits } from "@/lib/data/decimal";
import type { GeographyData } from "./queries";
export const GEOGRAPHY_RELATION = "obt_orders";
export const MAX_GROUPS = 500;
export const GeographyRow = z.object({
  kind: z.enum(["total", "group", "remainder", "trend"]),
  location: bq.string(),
  date: bq.date().nullable(),
  records: bq.int64(),
  orders: bq.int64(),
  revenue: bq.numeric().nullable(),
  previous_records: bq.int64(),
  previous_orders: bq.int64(),
  previous_revenue: bq.numeric().nullable(),
  second_records: bq.int64(),
  second_orders: bq.int64(),
  second_revenue: bq.numeric().nullable(),
  latest_date: bq.date().nullable(),
  previous_latest_date: bq.date().nullable(),
  second_latest_date: bq.date().nullable(),
});
export type GeographyRow = z.output<typeof GeographyRow>;
export function toGeographyData(wire: unknown[]): GeographyData {
  const rows = decodeRows(GeographyRow, wire, GEOGRAPHY_RELATION);
  const total = rows.find((row) => row.kind === "total");
  if (!total || rows.filter((row) => row.kind === "total").length !== 1)
    throw new Error("Geography total missing or duplicated");
  return {
    total,
    groups: rows.filter((row) => row.kind === "group" || row.kind === "remainder"),
    trend: rows.filter((row) => row.kind === "trend"),
  };
}
/** Totals come from an independent aggregate, never a ranked list. Null sums remain null. */
export function geographicReconciliation(data: GeographyData): boolean {
  const equal = (a: string | null, b: string | null) =>
    a === null || b === null ? a === b : toUnits(a) === toUnits(b);
  const counts = (key: "orders" | "records" | "previous_orders" | "second_orders") =>
    data.groups.reduce((sum, row) => sum + row[key], 0n) === data.total[key];
  return (
    counts("orders") &&
    counts("records") &&
    counts("previous_orders") &&
    counts("second_orders") &&
    equal(sumDecimals(data.groups.map((row) => row.revenue)), data.total.revenue) &&
    equal(sumDecimals(data.groups.map((row) => row.previous_revenue)), data.total.previous_revenue) &&
    equal(sumDecimals(data.groups.map((row) => row.second_revenue)), data.total.second_revenue)
  );
}
