import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataRegion } from "@/components/patterns/data-region";
import { WarehouseError } from "@/lib/data/warehouse-error";

const viewer = vi.hoisted(() => ({ mode: "live" }));
vi.mock("@/lib/auth/require-viewer", () => ({ requireViewer: async () => ({ mode: viewer.mode }) }));

beforeEach(() => {
  viewer.mode = "live";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

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

  it("timestamps completion, not the start of the query", async () => {
    await renderRegion(async () => {
      vi.setSystemTime(new Date("2026-10-06T12:00:17Z"));
      return ["a", "b"];
    });
    const timestamp = screen.getByText("Oct 6, 2026, 12:00:17 PM UTC");
    expect(timestamp).toHaveAttribute("datetime", "2026-10-06T12:00:17.000Z");
    expect(timestamp.parentElement).toHaveTextContent("Queried at");
  });

  it("labels a sample load without claiming a warehouse query", async () => {
    viewer.mode = "sample";
    await renderRegion(async () => ["a"]);
    expect(screen.getByText(/Sample loaded at/)).toBeInTheDocument();
    expect(screen.queryByText(/Queried at/)).not.toBeInTheDocument();
  });

  it("renders the empty state with its sentence", async () => {
    await renderRegion(async () => []);
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("No rows for this store.")).toBeInTheDocument();
    expect(screen.getByText(/Queried at/)).toBeInTheDocument();
  });

  it("renders a warehouse failure with the remedy, never sample data", async () => {
    await renderRegion(async () => {
      throw new WarehouseError("quota_exceeded", { status: 403, reason: "quotaExceeded" });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Query allowance used up");
    expect(screen.getByRole("alert")).toHaveTextContent("rotating the key will not help");
    expect(screen.queryByText(/Queried at|Sample loaded at/)).not.toBeInTheDocument();
  });

  it("names the relation and column when the schema changed", async () => {
    await renderRegion(async () => {
      throw WarehouseError.incompatible("rpt_executive_summary_daily", "website_sessions");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("website_sessions");
    expect(screen.getByRole("alert")).toHaveTextContent("pnpm schema rpt_executive_summary_daily");
    expect(screen.queryByText(/Queried at|Sample loaded at/)).not.toBeInTheDocument();
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
