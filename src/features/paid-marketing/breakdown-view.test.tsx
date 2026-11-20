import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BaselineProvider } from "@/components/patterns/baseline-switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseComparisonPlan } from "@/lib/comparison";
import { SpendBreakdownView } from "./breakdown";
import { paidMarketingOptions } from "./filters";
import type { SpendBreakdown } from "./queries";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

const params = {
  store: "democo",
  from: "2026-10-23",
  to: "2026-11-19",
  grain: "day",
  breakdown: "campaign",
  compare: "previous",
  compare2: "year",
};
const range = { from: params.from, to: params.to };
const originalUrl = window.location.href;
beforeEach(() => {
  window.history.replaceState(null, "", `/paid-marketing?${new URLSearchParams(params)}`);
  // jsdom has no layout. Give Recharts a measurable plot and its legend one line.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, 0, 640, this.classList.contains("recharts-legend-wrapper") ? 24 : 420);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", originalUrl);
});

function ranking(compare = "previous", partial = false) {
  const plan = parseComparisonPlan({ ...params, compare }, range, "2026-11-20");
  // Other campaigns have last-year coverage, but none of these current top-ten keys existed then.
  const data: SpendBreakdown = {
    hasMore: true,
    rows: Array.from({ length: 10 }, (_, i) => ({
      dimension_key: `platform / ${i}`,
      label: `Campaign ${i}`,
      spend: String(100 - i),
      previous_spend: i === 0 ? "0" : String(i),
      second_spend: null,
      total_spend: "1000",
      minimum_spend: "1",
      latest_date: partial ? "2026-11-05" : range.to,
      previous_latest_date: plan.slots[0].range?.to ?? null,
      second_latest_date: plan.slots[1].range?.to ?? null,
    })),
  };
  const { channel, names, breakdown } = paidMarketingOptions(params);
  render(
    <TooltipProvider>
      <BaselineProvider available={[!!plan.slots[0].range, !!plan.slots[1].range]}>
        <SpendBreakdownView
          data={data}
          plan={plan}
          params={params}
          currency="USD"
          dimension={breakdown}
          filters={{ storeId: params.store, range, channel, names: names.rules }}
        />
      </BaselineProvider>
    </TooltipProvider>,
  );
}

it("switches grouped campaign spend and its exact table from the previous 28 days to last year without replacing missing values with zero", () => {
  ranking();
  const chart = screen.getByRole("img", { name: "Spend by campaign chart" });
  expect(within(chart).getByText("Selected period")).toBeVisible();
  expect(within(chart).getByText("Previous 28 days")).toBeVisible();
  expect(chart.querySelectorAll(".recharts-bar")).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "View as table" }));
  const table = screen.getByRole("table", { name: "Spend by campaign" });
  const firstRow = () => within(table).getByRole("row", { name: /^Campaign 0 / });
  expect(
    within(firstRow())
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["$100.00", "$0.00"]);
  fireEvent.click(screen.getByRole("button", { name: "Last year" }));
  expect(within(table).getByRole("columnheader", { name: "Last year" })).toBeVisible();
  expect(within(table).getAllByRole("cell", { name: "No value" })).toHaveLength(10);
  expect(
    within(firstRow())
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["$100.00", "No value"]);
  expect(screen.getByText(/These ranked rows have no values in the comparison period/)).toBeVisible();
  const details = screen.getByRole("table", { name: "Spend by campaign details" });
  expect(within(details).getByRole("columnheader", { name: "Change vs last year" })).toBeVisible();
  expect(within(details).getAllByText("No comparison value")).toHaveLength(10);
});

it.each([
  ["off", false],
  ["previous", true],
] as const)(
  "keeps the chart on selected spend when comparisons are off or trailing coverage is insufficient (%s, %s)",
  (mode, partial) => {
    ranking(mode, partial);
    fireEvent.click(screen.getByRole("button", { name: "View as table" }));
    const table = screen.getByRole("table", { name: "Spend by campaign" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Campaign", "Spend"]);
    expect(screen.queryByRole("columnheader", { name: /Change vs/ })).toBeNull();
  },
);
