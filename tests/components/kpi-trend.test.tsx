import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { KpiCard } from "@/components/patterns/kpi-card";

it("exposes the full value as text when the visual headline is compact", () => {
  render(<KpiCard label="Revenue" value="$1.23M" fullValue="$1,234,567.89" period="Selected dates" />);
  expect(screen.getByText("$1.23M")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText("$1,234,567.89")).toHaveClass("sr-only");
});

function card(values: (number | bigint | null)[]) {
  return render(
    <KpiCard label="Revenue" value="1.00" period="Selected dates" trend={{ values, tableHref: "#daily" }} />,
  );
}

it("leaves missing days as gaps and links to the existing accessible detail table", () => {
  card([1, 2, null, 0, -1]);
  const graph = screen.getByRole("img", { name: /Revenue: daily trend/ });
  const path = graph.querySelector("path")?.getAttribute("d") ?? "";
  expect(path.match(/M/g)).toHaveLength(2);
  expect(path.match(/L/g)).toHaveLength(2);
  expect(screen.getByRole("link", { name: "View daily values for Revenue" })).toHaveAttribute("href", "#daily");
});

it("draws no trend for a one-day period, where the value already says it", () => {
  card([5]);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "View daily values for Revenue" })).not.toBeInTheDocument();
});

it.each([{ values: [0, 0] }, { values: [-10, -5] }, { values: [-Number.MAX_VALUE, Number.MAX_VALUE] }])(
  "draws finite coordinates for $values",
  ({ values }) => {
    card(values);
    const graph = screen.getByRole("img");
    expect(graph.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(graph.querySelector("path")?.getAttribute("d")).toContain("M");
  },
);

it("shows isolated days as dots rather than losing one-day reports", () => {
  card([3, null, 7]);
  expect(screen.getByRole("img").querySelectorAll("circle")).toHaveLength(2);
});

it("refuses to draw unsafe INT64 values and directs the viewer to the table", () => {
  card([9007199254740993n, 1n]);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Daily values available in the table")).toBeVisible();
  expect(screen.getByRole("link", { name: "View daily values for Revenue" })).toHaveAttribute("href", "#daily");
});

it("does not draw an all-missing period as a flat zero", () => {
  card([null, null]);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("No daily values")).toBeVisible();
});

it("leaves KPI cards without trends unchanged", () => {
  render(<KpiCard label="Orders" value="12" period="September" />);
  expect(screen.queryByText("Daily values")).not.toBeInTheDocument();
});

it("draws the shown comparison dashed behind the selected period, on one scale", () => {
  render(
    <KpiCard
      label="Revenue"
      value="1.00"
      trend={{
        values: [1, 2],
        tableHref: "#daily",
        comparisons: [{ label: "previous 2 days", values: [4, null] }, null],
      }}
    />,
  );
  const graph = screen.getByRole("img", { name: /with the previous 2 days dashed behind it/ });
  const [prior, current] = graph.querySelectorAll("path");
  expect(prior).toHaveAttribute("stroke-dasharray", "3 3");
  // The comparison's 4 is the top of the shared scale; the selected 1 sits at the bottom.
  expect(prior?.getAttribute("d")).toMatch(/^M2,2\b/);
  expect(current?.getAttribute("d")).toMatch(/^M2,42 L198,28\.6/);
});

it("draws no comparison for a slot without one, or one that cannot be plotted exactly", () => {
  render(
    <KpiCard
      label="Revenue"
      value="1.00"
      trend={{
        values: [1n, 2n],
        tableHref: "#daily",
        comparisons: [{ label: "last year", values: [9007199254740993n, 1n] }],
      }}
    />,
  );
  const graph = screen.getByRole("img", {
    name: "Revenue: daily trend for the selected period. Missing days are gaps.",
  });
  expect(graph.querySelectorAll("path")).toHaveLength(1);
});
