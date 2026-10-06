import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartCard } from "@/components/charts/chart-card";

const DATA = [
  { label: "Oct 1", orders: 10, orders__display: "10" },
  { label: "Oct 2", orders: null, orders__display: "No rows" },
  { label: "Oct 3", orders: 15, orders__display: "15" },
  { label: "Oct 4", orders: 20, orders__display: "20" },
];

describe("ChartCard", () => {
  beforeEach(() => {
    // jsdom has no layout; give the real responsive chart a measurable container.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 640,
      height: 256,
      top: 0,
      left: 0,
      bottom: 256,
      right: 640,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["line", "bar"] as const)("renders a %s plot and toggles to the server-formatted table", (kind) => {
    const { container } = render(
      <ChartCard
        title="Orders by day"
        kind={kind}
        categoryHeader="Date"
        series={[{ key: "orders", label: "Orders", color: "red" }]}
        data={DATA}
      />,
    );
    expect(screen.getByRole("img", { name: "Orders by day chart" })).toBeInTheDocument();
    expect(
      container.querySelector(kind === "line" ? ".recharts-line-curve" : ".recharts-bar-rectangle"),
    ).not.toBeNull();
    const toggle = screen.getByRole("button", { name: "View as table" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("table", { name: "Orders by day" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "No rows" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View as chart" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens on the table when a value cannot be plotted exactly", () => {
    render(
      <ChartCard
        title="Sessions"
        kind="line"
        categoryHeader="Date"
        plottable={false}
        series={[{ key: "orders", label: "Orders", color: "red" }]}
        data={DATA}
      />,
    );
    expect(screen.getByRole("table", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByText(/too large to plot exactly/)).toBeInTheDocument();
  });
});
