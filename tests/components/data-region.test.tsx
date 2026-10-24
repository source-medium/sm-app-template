import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataRegion } from "@/components/patterns/data-region";
import { WarehouseError } from "@/lib/data/warehouse-error";

const viewer = vi.hoisted(() => ({
  mode: "live",
  provenance: { oldestQueriedAt: null as string | null, servedFromCache: 0 },
}));
vi.mock("@/lib/auth/require-viewer", () => ({
  requireViewer: async () => ({
    mode: viewer.mode,
    request: { id: "r", bypassCache: false, provenance: viewer.provenance },
  }),
}));

beforeEach(() => {
  viewer.mode = "live";
  viewer.provenance = { oldestQueriedAt: null, servedFromCache: 0 };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function renderRegion(load: () => Promise<string[]>) {
  const element = await DataRegion({
    load,
    isEmpty: (rows: string[]) => rows.length === 0,
    emptyMessage: "No rows for this store.",
    timestamp: "America/New_York",
    children: (rows: string[]) => <p>{rows.join(",")}</p>,
  });
  render(element);
}

describe("DataRegion", () => {
  it.each([
    new WarehouseError("quota_exceeded", { status: 403, reason: "quotaExceeded" }),
    WarehouseError.incompatible("cohorts", "segment"),
  ])("keeps applied form controls when an options query fails, while still showing its error", async (error) => {
    const element = await DataRegion({
      load: async () => {
        throw error;
      },
      isEmpty: () => false,
      emptyMessage: "",
      timestamp: false,
      errorContent: (
        <select name="segment" aria-label="Applied segment" defaultValue="existing">
          <option value="existing">Existing segment</option>
        </select>
      ),
      children: () => <p>Loaded options</p>,
    });
    const { container } = render(<form>{element}</form>);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByLabelText("Applied segment")).toHaveValue("existing");
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing filter form");
    expect(new FormData(form).get("segment")).toBe("existing");
    expect(screen.queryByText("Loaded options")).not.toBeInTheDocument();
  });

  it("renders the data", async () => {
    await renderRegion(async () => ["a", "b"]);
    expect(screen.getByText("a,b")).toBeInTheDocument();
  });

  it("timestamps completion, not the start of the query, in the store's time zone", async () => {
    await renderRegion(async () => {
      vi.setSystemTime(new Date("2026-10-06T12:00:17Z"));
      return ["a", "b"];
    });
    const timestamp = screen.getByText("Oct 6, 2026, 8:00:17 AM EDT");
    expect(timestamp).toHaveAttribute("datetime", "2026-10-06T12:00:17.000Z");
    expect(timestamp.parentElement).toHaveTextContent("Loaded at");
    expect(screen.queryByText(/cached results/)).not.toBeInTheDocument();
  });

  it("names an order-offset zone, and skips the time for filter options", async () => {
    const offsetZone = await DataRegion({
      load: async () => ["a"],
      isEmpty: () => false,
      emptyMessage: "",
      timestamp: "-07:00",
      children: () => null,
    });
    const { unmount } = render(offsetZone);
    expect(screen.getByText("Oct 6, 2026, 5:00:00 AM GMT-7")).toBeInTheDocument();
    unmount();
    const options = await DataRegion({
      load: async () => ["a"],
      isEmpty: () => false,
      emptyMessage: "",
      timestamp: false,
      children: () => <p>options</p>,
    });
    render(options);
    expect(screen.getByText("options")).toBeInTheDocument();
    expect(screen.queryByText(/Loaded at/)).not.toBeInTheDocument();
  });

  it("labels a sample load without claiming a warehouse query", async () => {
    viewer.mode = "sample";
    await renderRegion(async () => ["a"]);
    expect(screen.getByText(/Sample loaded at/)).toBeInTheDocument();
    expect(screen.queryByText(/Loaded at/)).not.toBeInTheDocument();
  });

  it("says how old cached results may be when the query cache served some of this request", async () => {
    viewer.provenance = { oldestQueriedAt: "2026-10-06T11:58:00.000Z", servedFromCache: 2 };
    await renderRegion(async () => ["a"]);
    const note = screen.getByText(/includes cached results queried at/);
    expect(note).toHaveTextContent("Oct 6, 2026, 7:58:00 AM EDT");
    expect(screen.getByText(/Loaded at/)).toBeInTheDocument();
  });

  it("renders the empty state with its sentence", async () => {
    await renderRegion(async () => []);
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("No rows for this store.")).toBeInTheDocument();
    expect(screen.getByText(/Loaded at/)).toBeInTheDocument();
  });

  it("renders a warehouse failure with the remedy, never sample data", async () => {
    await renderRegion(async () => {
      throw new WarehouseError("quota_exceeded", { status: 403, reason: "quotaExceeded" });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Query allowance used up");
    expect(screen.getByRole("alert")).toHaveTextContent("rotating the key will not help");
    expect(screen.queryByText(/Loaded at|Sample loaded at/)).not.toBeInTheDocument();
  });

  it("names the relation and column when the schema changed", async () => {
    await renderRegion(async () => {
      throw WarehouseError.incompatible("rpt_executive_summary_daily", "website_sessions");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("website_sessions");
    expect(screen.getByRole("alert")).toHaveTextContent("pnpm schema rpt_executive_summary_daily");
    expect(screen.queryByText(/Loaded at|Sample loaded at/)).not.toBeInTheDocument();
  });

  it("rethrows anything else to the route's error boundary", async () => {
    await expect(
      DataRegion({
        load: async () => {
          throw new TypeError("a bug");
        },
        isEmpty: () => false,
        emptyMessage: "",
        timestamp: "UTC",
        children: () => null,
      }),
    ).rejects.toThrow("a bug");
  });
});
