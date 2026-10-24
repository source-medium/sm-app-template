import { describe, expect, it } from "vitest";
import { sampleGeography } from "./sample";
import { geographicReconciliation, toGeographyData } from "./rows";
import { normalizeCountry, normalizeRegion } from "@/lib/shipping-geography";
import { sampleOrderRowsForDay } from "@/lib/sample/orders";
import { datesInRange } from "@/lib/filters";
import { sumDecimals } from "@/lib/data/decimal";
const filters = {
  storeId: "sample-store-a",
  range: { from: "2026-09-01", to: "2026-09-28" },
  dateBasis: "processed" as const,
  country: null,
  region: null,
  channel: null,
};
it("normalizes state names only in country context, retaining unknown and unsupported regions", () => {
  expect(normalizeRegion("US", "California")).toBe("CA");
  expect(normalizeRegion("US", "US-ca")).toBe("CA");
  expect(normalizeRegion("CA", "CA")).toBe("CA");
  expect(normalizeRegion("AU", "California")).toBe("CALIFORNIA");
  expect(normalizeCountry(" (unknown) ")).toBe("(unknown)");
  expect(normalizeRegion("US", "(UNKNOWN)")).toBe("(unknown)");
  expect(normalizeRegion("CA", "(unknown)")).toBe("(unknown)");
  expect(normalizeRegion(null, null)).toBe("(unknown)");
});
for (const dateBasis of ["created", "processed"] as const)
  describe(dateBasis, () => {
    it("reconciles every destination to an independent total and its source fixture population", async () => {
      const scoped = { ...filters, dateBasis, country: "US", region: "CA" };
      const data = sampleGeography(scoped, { from: "2026-08-04", to: "2026-08-31" });
      expect(geographicReconciliation(data)).toBe(true);
      const revenues = datesInRange(scoped.range)
        .flatMap((date) => sampleOrderRowsForDay(scoped.storeId, date))
        .filter(
          (row) =>
            row.is_order_sm_valid === "true" &&
            row.order_shipping_country_code === "US" &&
            row.order_shipping_state === "CA",
        )
        .map((row) => row.order_net_revenue ?? null);
      expect(BigInt(revenues.length)).toBe(data.total.orders);
      expect(sumDecimals(revenues)).toBe(data.total.revenue);
    });
  });
it("retains exact negative, zero, null and unsafe counts including remainder groups", () => {
  const base = {
    date: null,
    records: "1",
    orders: "9007199254740993",
    revenue: "-12345678901234567890.123456789",
    previous_records: "0",
    previous_orders: "0",
    previous_revenue: null,
    latest_date: "2026-09-01",
    previous_latest_date: null,
  };
  const data = toGeographyData([
    { ...base, kind: "total", location: "" },
    { ...base, kind: "remainder", location: "(other)" },
  ]);
  expect(geographicReconciliation(data)).toBe(true);
  const firstGroup = data.groups[0];
  if (!firstGroup) throw new Error("Expected remainder fixture");
  expect(data.total.orders).toBe(9007199254740993n);
  expect(geographicReconciliation({ ...data, groups: [{ ...firstGroup, revenue: "0" }] })).toBe(false);
  expect(
    geographicReconciliation({
      ...data,
      total: { ...data.total, revenue: null },
      groups: [{ ...firstGroup, revenue: null }],
    }),
  ).toBe(true);
});
