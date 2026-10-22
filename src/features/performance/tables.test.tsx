import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { BusinessTable } from "./tables";
import { sampleBusiness } from "./sample";
import type { PerformanceFilters } from "./queries";

it("sorts money numerically in both directions and keeps missing values last", () => {
  const filters: PerformanceFilters = {
    storeId: "sample-store-a",
    range: { from: "2026-09-01", to: "2026-09-07" },
    channel: null,
    grain: "day",
  };
  const source = sampleBusiness(filters).find((row) => !row.is_total);
  if (!source) throw new Error("Expected a sample business period");
  render(
    <BusinessTable
      records={["10.01", "9.5", "1.09", "1.1", "-2", null].map((revenue, index) => ({
        ...source,
        period_date: `2026-09-0${index + 1}`,
        revenue,
      }))}
      filters={filters}
      group="revenue"
      currency="USD"
    />,
  );
  const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
  expect(headers.slice(0, 4)).toEqual(["Period", "Net revenue", "Summary orders", "Net revenue / order"]);
  const revenueIndex = headers.indexOf("Net revenue");
  const values = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[revenueIndex]?.textContent);
  fireEvent.click(screen.getByRole("button", { name: "Net revenue" }));
  expect(values()).toEqual(["$10.01", "$9.50", "$1.10", "$1.09", "-$2.00", "—"]);
  fireEvent.click(screen.getByRole("button", { name: "Net revenue" }));
  expect(values()).toEqual(["-$2.00", "$1.09", "$1.10", "$9.50", "$10.01", "—"]);
});
