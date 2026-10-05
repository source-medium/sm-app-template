import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartCard } from "@/components/charts/chart-card";

const DATA = [
  { label: "Oct 1", orders: 10, orders__display: "10" },
  { label: "Oct 2", orders: null, orders__display: "No rows" },
];

describe("ChartCard", () => {
  it("toggles to an accessible table of the server-formatted values", () => {
    render(
      <ChartCard
        title="Orders by day"
        kind="line"
        categoryHeader="Date"
        series={[{ key: "orders", label: "Orders", color: "red" }]}
        data={DATA}
      />,
    );
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
