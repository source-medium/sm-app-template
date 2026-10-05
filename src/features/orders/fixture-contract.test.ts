import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, PAGE_SIZE, type OrderCursor } from "./queries";
import { sampleOrderDetail, sampleOrders } from "./sample";

const FILTERS = {
  storeId: "sample-store-a",
  range: { from: "2026-09-01", to: "2026-09-07" },
  search: null,
  cursor: null,
};

describe("orders fixture contract", () => {
  it("keyset pages are newest first, never overlap, and reach every order", async () => {
    const seen = new Set<string>();
    let cursor: OrderCursor | null = null;
    let previous: bigint | null = null;
    for (let page = 0; page < 50; page += 1) {
      const result = await sampleOrders({ ...FILTERS, cursor });
      for (const order of result.orders) {
        expect(seen.has(order.key)).toBe(false);
        seen.add(order.key);
        if (previous !== null) expect(order.createdAt.micros <= previous).toBe(true);
        previous = order.createdAt.micros;
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

  it("reads one order's details by key and creation time", async () => {
    const [order] = (await sampleOrders(FILTERS)).orders;
    if (!order) throw new Error("expected an order");
    const detail = await sampleOrderDetail(FILTERS.storeId, {
      createdAtMicros: order.createdAt.micros,
      key: order.key,
    });
    expect(detail?.key).toBe(order.key);
    expect(await sampleOrderDetail(FILTERS.storeId, { createdAtMicros: 1n, key: order.key })).toBeNull();
    expect(
      await sampleOrderDetail("sample-store-b", { createdAtMicros: order.createdAt.micros, key: order.key }),
    ).toBeNull();
  });

  it("round-trips the URL cursor and ignores anything malformed", () => {
    const cursor = { createdAtMicros: 1_759_600_000_123_456n, key: "store-a-10042/ü" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    for (const bad of [undefined, "", "%%%", btoa("[1,2,3]"), btoa('["1.5","k"]'), btoa('["1",2]'), "x".repeat(500)]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });
});
