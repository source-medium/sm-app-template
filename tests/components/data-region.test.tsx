import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataRegion } from "@/components/patterns/data-region";
import { WarehouseError } from "@/lib/data/warehouse-error";

async function renderRegion(load: () => Promise<string[]>) {
  const element = await DataRegion({
    load,
    isEmpty: (rows: string[]) => rows.length === 0,
    emptyMessage: "No rows for this store.",
    children: (rows: string[]) => <p>{rows.join(",")}</p>,
  });
  render(element);
}

describe("DataRegion", () => {
  it("renders the data", async () => {
    await renderRegion(async () => ["a", "b"]);
    expect(screen.getByText("a,b")).toBeInTheDocument();
  });

  it("renders the empty state with its sentence", async () => {
    await renderRegion(async () => []);
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("No rows for this store.")).toBeInTheDocument();
  });

  it("renders a warehouse failure with the remedy, never sample data", async () => {
    await renderRegion(async () => {
      throw new WarehouseError("quota_exceeded", { status: 403, reason: "quotaExceeded" });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Query allowance used up");
    expect(screen.getByRole("alert")).toHaveTextContent("rotating the key will not help");
  });

  it("names the relation and column when the schema changed", async () => {
    await renderRegion(async () => {
      throw WarehouseError.incompatible("rpt_executive_summary_daily", "website_sessions");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("website_sessions");
    expect(screen.getByRole("alert")).toHaveTextContent("pnpm schema rpt_executive_summary_daily");
  });

  it("rethrows anything else to the route's error boundary", async () => {
    await expect(
      DataRegion({
        load: async () => {
          throw new TypeError("a bug");
        },
        isEmpty: () => false,
        emptyMessage: "",
        children: () => null,
      }),
    ).rejects.toThrow("a bug");
  });
});
