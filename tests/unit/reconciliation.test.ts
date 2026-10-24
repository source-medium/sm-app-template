import { expect, it } from "vitest";
import { parseCsv, reconcile, Reference } from "../../scripts/lib/reconciliation";
const reference = Reference.parse({
  report: "business",
  source: "Reviewed reference",
  store: "store-a",
  from: "2026-09-01",
  to: "2026-09-30",
  currency: "USD",
  channels: ["DTC", "Amazon"],
  grain: "month",
  metrics: [
    { field: "revenue", expected: "9007199254740993.123456789", definition: "Published net revenue" },
    { field: "orders", expected: "10", definition: "Summary orders" },
  ],
});
const total = {
  report: "business",
  data_mode: "live",
  store_id: "store-a",
  from: reference.from,
  to: reference.to,
  reporting_currency: "USD",
  sales_channels: '["Amazon","DTC"]',
  grain: "month",
  row_type: "total",
  revenue: "9007199254740993.123456789",
  orders: "11",
};
it("compares full totals exactly without hiding unresolved differences", () => {
  expect(reconcile(reference, [total]).map((item) => item.status)).toEqual(["match", "unresolved"]);
  expect(reconcile(reference, [{ ...total, revenue: "9007199254740993.123456788" }])[0]?.status).toBe("unresolved");
  const tolerant = structuredClone(reference);
  if (tolerant.metrics[0]) tolerant.metrics[0].tolerance = "0.000000001";
  expect(reconcile(tolerant, [{ ...total, revenue: "9007199254740993.123456788" }])[0]?.status).toBe("match");
});
it.each([
  { data_mode: "sample" },
  { store_id: "other" },
  { sales_channels: "DTC" },
  { reporting_currency: "" },
  { from: "2026-09-02" },
  { report: "platforms" },
])("refuses different or unverified scope: %j", (change) => {
  expect(() => reconcile(reference, [{ ...total, ...change }])).toThrow("Scope differs");
});
it("refuses absent or duplicated totals and leaves null measures unresolved", () => {
  expect(() => reconcile(reference, [{ ...total, row_type: "period" }])).toThrow("exactly one");
  expect(() => reconcile(reference, [total, total])).toThrow("exactly one");
  expect(reconcile(reference, [{ ...total, revenue: "" }])[0]?.status).toBe("unresolved");
});
it("parses the app's escaped CSV without treating commas, quotes or newlines as new rows", () => {
  expect(parseCsv('"header","second"\r\n"a,b","say ""hello""\nagain"\r\n')).toEqual([
    { header: "a,b", second: 'say "hello"\nagain' },
  ]);
  expect(() => parseCsv('"a","b"\n"unfinished')).toThrow("unfinished");
});

it("requires exact geographic population, date basis and destination for reconciliation", () => {
  const geo = Reference.parse({
    ...reference,
    report: "geography",
    date_basis: "processed",
    country: "US",
    region: "CA",
  });
  const row = {
    ...total,
    report: "geography",
    date_basis: "processed",
    population: "valid",
    country: "US",
    region: "CA",
  };
  expect(reconcile(geo, [row])[0]?.status).toBe("match");
  for (const changed of [{ date_basis: "created" }, { population: "all" }, { country: "CA" }, { region: "" }]) {
    expect(() => reconcile(geo, [{ ...row, ...changed }])).toThrow("Scope differs");
  }
  expect(() => Reference.parse({ ...reference, report: "geography" })).toThrow();
});
