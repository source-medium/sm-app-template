import { appConfig } from "@/app.config";
import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { StoreComparisonTable } from "./comparison-table";
import type { StoreComparison } from "./queries";
import { parseComparisonPlan } from "@/lib/comparison";

const range = { from: "2026-09-01", to: "2026-09-07" };
const baseline = { from: "2026-08-25", to: "2026-08-31" };
/** Previous 7 days (the baseline above) and the same dates last year, which have no rows in these fixtures. */
const plan = parseComparisonPlan({ compare: "previous" }, range, "2026-10-01");
const now = new Date("2026-10-01T12:00:00Z");
function store(id: string, currency: string | null, latest = range.to): StoreComparison {
  return {
    store: { id, label: id, domain: null, logoUrl: null, brand: null, timeZone: "America/New_York", currency: "CAD" },
    currency,
    summary: {
      sm_store_id: id,
      revenue: "1234.56",
      previous_revenue: "1000",
      spend: "100",
      previous_spend: null,
      orders: 1.5,
      previous_orders: 1,
      second_revenue: null,
      second_orders: null,
      second_spend: null,
      latest_date: latest,
      previous_latest_date: baseline.to,
      second_latest_date: null,
    },
  };
}
it("labels verified currencies per row, leaves unknown money unlabeled, and exposes no monetary ranking or totals", () => {
  render(
    <StoreComparisonTable
      data={[store("US", "USD"), store("UK", "GBP"), store("Unknown", null)]}
      range={range}
      plan={plan}
      params={{ compare: "previous" }}
      now={now}
    />,
  );
  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(4);
  expect(rows[1]).toHaveTextContent("USD$1,234.56");
  expect(rows[2]).toHaveTextContent("GBP£1,234.56");
  expect(rows[3]).toHaveTextContent("Unknown1,234.56");
  for (const header of ["Net revenue", "Ad spend"])
    expect(within(screen.getByRole("columnheader", { name: header })).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "UK" })).toHaveAttribute(
    "href",
    `${appConfig.nav.find((item) => item.scope !== "all-stores")?.href}?compare=previous&from=2026-09-01&to=2026-09-07&store=UK`,
  );
});
it("hides only the affected store's comparison and retains a store with no rows", () => {
  render(
    <StoreComparisonTable
      data={[store("Ready", "USD"), store("Late", "USD", "2026-09-06"), { ...store("Empty", "USD"), summary: null }]}
      range={range}
      plan={plan}
      params={{}}
      now={now}
    />,
  );
  const rows = screen.getAllByRole("row");
  expect(rows[1]).toHaveTextContent("+23.46%");
  expect(rows[2]).toHaveTextContent("Hidden");
  expect(rows[3]).toHaveTextContent("No rows in selected period");
  expect(rows[3]).not.toHaveTextContent("$0");
});
it("uses each store's local date for current-day completeness and omits comparisons when off", () => {
  const data = [
    store("East", "USD"),
    { ...store("West", "USD"), store: { ...store("West", "USD").store, timeZone: "America/Los_Angeles" } },
  ];
  const props = { data, range, params: {}, now: new Date("2026-09-08T05:00:00Z") };
  const { rerender } = render(<StoreComparisonTable {...props} plan={plan} />);
  const rows = screen.getAllByRole("row");
  expect(rows[1]).toHaveTextContent("+23.46%");
  expect(rows[2]).toHaveTextContent("Hidden");
  expect(rows[2]).toHaveTextContent("Today may be incomplete");
  rerender(<StoreComparisonTable {...props} plan={undefined} />);
  expect(screen.queryByRole("columnheader", { name: /Revenue change/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Why some changes are hidden")).not.toBeInTheDocument();
});
