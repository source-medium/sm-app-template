import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { KpiCard } from "@/components/patterns/kpi-card";

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

it.each([
  { values: [0] },
  { values: [0, 0] },
  { values: [-10, -5] },
  { values: [-Number.MAX_VALUE, Number.MAX_VALUE] },
])("draws finite coordinates for $values", ({ values }) => {
  card(values);
  const graph = screen.getByRole("img");
  expect(graph.innerHTML).not.toMatch(/NaN|Infinity/);
  expect(graph.querySelector("path")?.getAttribute("d")).toContain("M");
});

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
