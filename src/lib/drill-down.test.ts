import { expect, it } from "vitest";
import { drillDown, type Investigation } from "./drill-down";
const context: Investigation = {
  store: "s",
  from: "2026-02-01",
  to: "2026-02-28",
  dateBasis: "processed",
  population: "valid orders",
  filters: { country: "US", sales_channel: "online_dtc" },
};
it("preserves explicit mapped scope and leaves no stale pagination", () => {
  const result = drillDown(context, {
    pathname: "/orders",
    dateBasis: "processed",
    population: "valid orders",
    filters: { country: "country", sales_channel: "sales_channel" },
    required: { date_basis: "processed", valid: "true" },
  });
  const url = new URL(result.href ?? "", "https://app.test");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    store: "s",
    from: "2026-02-01",
    to: "2026-02-28",
    country: "US",
    sales_channel: "online_dtc",
    date_basis: "processed",
    valid: "true",
  });
});
it("refuses silent population, date, comparison or material-filter changes", () => {
  const result = drillDown(
    { ...context, comparison: "year" },
    { pathname: "/creatives", dateBasis: "ad date", population: "platform claims", filters: {} },
  );
  expect(result.href).toBeNull();
  expect(result.reasons).toHaveLength(5);
});
