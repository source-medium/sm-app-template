import { MAX_PRODUCT_ROWS, PRODUCT_PAGE_SIZE, type Product } from "./rows";
import type { ProductsData } from "./queries";

/** The last page the explorer reaches. */
export const PRODUCT_PAGES = MAX_PRODUCT_ROWS / PRODUCT_PAGE_SIZE;

/** Rows `[offset, offset + limit)` for a page, or the whole bounded set for an export. */
export function productWindow(page: number | undefined, all = false) {
  return all
    ? { offset: 0, limit: MAX_PRODUCT_ROWS }
    : { offset: ((page ?? 1) - 1) * PRODUCT_PAGE_SIZE, limit: PRODUCT_PAGE_SIZE };
}

/** A page of ranked rows from the matched count, in the same shape for live and sample data. */
export function productPage(rows: Product[], matched: bigint, page: number | undefined, all = false): ProductsData {
  const { offset, limit } = productWindow(page, all);
  return {
    rows: rows.slice(0, limit),
    hasMore: !all && BigInt(offset + limit) < matched && offset + limit < MAX_PRODUCT_ROWS,
    matched,
    page: all ? 1 : (page ?? 1),
    truncated: matched > BigInt(MAX_PRODUCT_ROWS),
  };
}

/** A whole page number within the explorer's bound; anything else is the first page. */
export function productPageParam(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= PRODUCT_PAGES ? page : 1;
}
