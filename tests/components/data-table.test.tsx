import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "@/components/patterns/data-table";

const rows = [
  { id: "a", cells: { name: { display: "Alpha" }, n: { display: "2", sort: 2 } } },
  { id: "b", cells: { name: { display: "Beta" }, n: { display: "10", sort: 10 } } },
];
const columns = [
  { key: "name", header: "Name" },
  { key: "n", header: "Count", align: "right" as const },
];

describe("DataTable", () => {
  it("says so when the query helper reported truncation", () => {
    render(<DataTable caption="Things" columns={columns} rows={rows} truncated />);
    expect(screen.getByText(/Showing the first 2 rows; more rows matched/)).toBeInTheDocument();
  });

  it("sorts by the raw value, not the display text", () => {
    render(<DataTable caption="Things" columns={columns} rows={rows} />);
    // Numeric columns sort largest first on the first click (TanStack's default), then flip.
    fireEvent.click(screen.getByRole("button", { name: /Count/ }));
    const [, first] = screen.getAllByRole("row");
    expect(within(first as HTMLElement).getByText("Beta")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Count/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /Count/ }));
    const [, top] = screen.getAllByRole("row");
    expect(within(top as HTMLElement).getByText("Alpha")).toBeInTheDocument();
  });
});
