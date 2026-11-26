import { expect, it } from "vitest";
import { PRODUCT_PAGES, productPage, productPageParam, productWindow } from "./paging";

it("reads a whole page within the bound and falls back to the first page", () => {
  expect(PRODUCT_PAGES).toBe(10);
  expect(["2", "10"].map(productPageParam)).toEqual([2, 10]);
  expect([undefined, "", "0", "11", "1.5", "-1", "two"].map(productPageParam)).toEqual([1, 1, 1, 1, 1, 1, 1]);
});

it("pages 50 rows at a time and exports the whole bounded set at once", () => {
  expect(productWindow(1)).toEqual({ offset: 0, limit: 50 });
  expect(productWindow(3)).toEqual({ offset: 100, limit: 50 });
  expect(productWindow(3, true)).toEqual({ offset: 0, limit: 500 });
});

it("offers a next page only within the bound, and says when matches pass it", () => {
  expect(productPage([], 50n, 1)).toMatchObject({ hasMore: false, truncated: false, page: 1 });
  expect(productPage([], 51n, 1)).toMatchObject({ hasMore: true, truncated: false });
  expect(productPage([], 600n, 9)).toMatchObject({ hasMore: true, truncated: true });
  expect(productPage([], 600n, 10)).toMatchObject({ hasMore: false, truncated: true, page: 10 });
  expect(productPage([], 500n, 10)).toMatchObject({ hasMore: false, truncated: false });
  expect(productPage([], 600n, 4, true)).toMatchObject({ hasMore: false, truncated: true, page: 1 });
});
