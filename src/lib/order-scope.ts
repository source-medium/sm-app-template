/** Fixed, reviewed local-date expressions. An absent basis retains legacy Orders behavior. */
export type OrderDateBasis = "created" | "processed";
export const ORDER_DATE_EXPRESSIONS = {
  created: "order_created_at_local_datetime",
  processed: "COALESCE(order_processed_at_local_datetime, order_created_at_local_datetime)",
} as const;
export function orderDateExpression(basis?: OrderDateBasis | null): string {
  return basis ? ORDER_DATE_EXPRESSIONS[basis] : "order_processed_at_local_datetime";
}
const PROCESSED = "order_processed_at_local_datetime";
const CREATED = "order_created_at_local_datetime";
const within = (column: string, from: string, to: string) =>
  `${column} >= DATETIME(${from}) AND ${column} < DATETIME(DATE_ADD(${to}, INTERVAL 1 DAY))`;

/**
 * Rows whose local date on `basis` falls within the DATE expressions `from`..`to`
 * (such as @start_date and @end_date). For the catalog's processed-with-created
 * fallback this is written as a disjunction over the bare columns rather than
 * COALESCE(...), which is the same set of rows but lets BigQuery prune the
 * processed partition to the window plus its NULL partition. Created dates have
 * no processed-date bound and are not pruned.
 */
export function orderDateWindow(basis: OrderDateBasis | null | undefined, from: string, to: string): string {
  if (basis === "processed")
    return `((${within(PROCESSED, from, to)}) OR (${PROCESSED} IS NULL AND ${within(CREATED, from, to)}))`;
  return `(${within(orderDateExpression(basis), from, to)})`;
}

/** Rows whose `basis` time equals the DATETIME expression `value`, in the same prunable form. */
export function orderDateEquals(basis: OrderDateBasis | null | undefined, value: string): string {
  if (basis === "processed") return `(${PROCESSED} = ${value} OR (${PROCESSED} IS NULL AND ${CREATED} = ${value}))`;
  return `${orderDateExpression(basis)} = ${value}`;
}

export function orderDateLabel(basis?: OrderDateBasis | null): string {
  return basis === "created"
    ? "Created (store time)"
    : basis === "processed"
      ? "Processed, falling back to created (store time)"
      : "Processed (store time)";
}
