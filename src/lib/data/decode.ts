/**
 * Decoders for BigQuery REST cells, which arrive as strings or null.
 *
 * - INT64 stays exact as a bigint; NUMERIC stays an exact decimal string.
 * - FLOAT64 is approximate by definition and must be finite.
 * - DATE stays a calendar string ("2026-10-04"), never a Date in some time zone.
 * - TIMESTAMP keeps its exact microseconds (the client asks for int64 timestamps).
 *
 * A row that fails its schema names the relation and column, never the value.
 */
import { z } from "zod";
import { WarehouseError } from "./warehouse-error";

const INTEGER = /^-?[0-9]{1,19}$/;
const FLOAT = /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const DECIMAL = /^-?[0-9]+(?:\.[0-9]+)?$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export type Instant = { micros: bigint; iso: string };

export const bq = {
  string: () => z.string(),
  int64: () =>
    z
      .string()
      .regex(INTEGER)
      .transform((value) => BigInt(value)),
  float64: () => z.string().regex(FLOAT).transform(Number).pipe(z.number()),
  numeric: () => z.string().regex(DECIMAL),
  date: () => z.string().regex(DATE),
  bool: () => z.enum(["true", "false"]).transform((value) => value === "true"),
  timestamp: () =>
    z
      .string()
      .regex(INTEGER)
      .transform((value): Instant => {
        const micros = BigInt(value);
        return { micros, iso: new Date(Number(micros / 1000n)).toISOString() };
      }),
};

/** Decodes every row or throws an incompatible-schema error naming the first bad column. */
export function decodeRows<Schema extends z.ZodType>(
  schema: Schema,
  rows: readonly unknown[],
  relation: string,
): z.output<Schema>[] {
  return rows.map((row) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      const column = parsed.error.issues[0]?.path[0];
      throw WarehouseError.incompatible(relation, typeof column === "string" ? column : "(row)");
    }
    return parsed.data;
  });
}

/**
 * A chart number from an exact value, or null when it cannot be represented
 * without rounding. An unsafe integer is never rounded into a plausible count.
 */
export function toChartNumber(value: bigint | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return value > max || value < -max ? null : Number(value);
}
