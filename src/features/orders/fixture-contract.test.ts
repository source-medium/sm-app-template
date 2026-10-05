import { describe, expect, it } from "vitest";
import { sumDecimals, toUnits } from "@/lib/data/decimal";
import { decodeRef, encodeRef, PAGE_SIZE, type OrderRef } from "./queries";
import { sampleOrderDetail, sampleOrders } from "./sample";

const FILTERS = {
  storeId: "sample-store-a",
  range: { from: "2026-09-01", to: "2026-09-07" },
  search: null,
  cursor: null,
};

describe("orders fixture contract", () => {
  it("keyset pages are newest first by processed time, never overlap, and reach every order", async () => {
    const seen = new Set<string>();
    let cursor: OrderRef | null = null;
    let previous: string | null = null;
    for (let page = 0; page < 50; page += 1) {
      const result = await sampleOrders({ ...FILTERS, cursor });
      for (const order of result.orders) {
        expect(seen.has(order.key)).toBe(false);
        seen.add(order.key);
        if (previous !== null) expect(order.processedLocal <= previous).toBe(true);
        expect(order.processedLocal.slice(0, 10) >= FILTERS.range.from).toBe(true);
        previous = order.processedLocal;
      }
      expect(result.orders.length).toBeLessThanOrEqual(PAGE_SIZE);
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    expect(seen.size).toBeGreaterThan(PAGE_SIZE);
  });

  it("finds an order by name, with or without the #", async () => {
    const first = (await sampleOrders(FILTERS)).orders.find((order) => order.name?.startsWith("#"));
    expect(first).toBeDefined();
    const name = first?.name ?? "";
    for (const search of [name, name.slice(1)]) {
      const result = await sampleOrders({ ...FILTERS, search });
      expect(result.orders.map((order) => order.key)).toContain(first?.key);
    }
  });

  it("reads one order's details, with amounts that add up exactly", async () => {
    const [order] = (await sampleOrders(FILTERS)).orders;
    if (!order) throw new Error("expected an order");
    const detail = await sampleOrderDetail(FILTERS.storeId, { processedLocal: order.processedLocal, key: order.key });
    expect(detail?.key).toBe(order.key);
    expect(detail?.netRevenue).toBe(order.netRevenue);
    if (detail && detail.isValidOrder) {
      // net = gross - discounts - refunds, in exact decimal arithmetic.
      const expected =
        toUnits(detail.grossRevenue ?? "0") - toUnits(detail.discounts ?? "0") - toUnits(detail.refunds ?? "0");
      expect(toUnits(detail.netRevenue ?? "0")).toBe(expected);
      expect(sumDecimals([detail.netRevenue, detail.shipping, detail.taxes])).toBe(detail.totalRevenue);
    }
    expect(
      await sampleOrderDetail(FILTERS.storeId, { processedLocal: "2020-01-01T00:00:00", key: order.key }),
    ).toBeNull();
    expect(
      await sampleOrderDetail("sample-store-b", { processedLocal: order.processedLocal, key: order.key }),
    ).toBeNull();
  });

  it("round-trips the URL reference and ignores anything malformed", () => {
    const ref = { processedLocal: "2026-10-04T13:22:11.123456", key: "store-a-10042/ü" };
    expect(decodeRef(encodeRef(ref))).toEqual(ref);
    for (const bad of [
      undefined,
      "",
      "%%%",
      btoa("[1,2,3]"),
      btoa('["2026-10-04 13:22:11","k"]'),
      btoa('["2026-10-04T13:22:11",2]'),
      btoa('["2026-10-04T13:22:11",""]'),
      "x".repeat(500),
    ]) {
      expect(decodeRef(bad)).toBeNull();
    }
  });
});
