import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReportHeader } from "@/components/shell/report-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const props = {
  title: "Revenue",
  description: "Published sales",
  pathname: "/overview",
  params: {},
  dates: true,
  agentFilters: {},
  agentOmissions: [],
  sources: [],
};

it("places freshness and currency uncertainty beside the report title", () => {
  const { container, rerender } = render(<ReportHeader {...props} mode="live" />, { wrapper: TooltipProvider });
  const trust = container.querySelector('[data-slot="report-trust"]');
  expect(trust).toHaveTextContent("Warehouse freshness: unknown");
  expect(trust).toHaveTextContent("Currency unknown; amounts are unlabeled");
  expect(screen.getByRole("heading", { name: "Revenue" }).parentElement).toContainElement(trust as HTMLElement);
  rerender(<ReportHeader {...props} mode="live" currency="CAD" />);
  expect(trust).toHaveTextContent("Reporting currency: CAD");
  expect(trust).not.toHaveTextContent("Currency unknown");
  rerender(<ReportHeader {...props} mode="live" allStores />);
  expect(trust).toHaveTextContent("Currencies shown per store; no combined totals");
  rerender(<ReportHeader {...props} mode="sample" currency="USD" />);
  expect(trust).toHaveTextContent("Synthetic sample data");
  expect(trust).not.toHaveTextContent("Warehouse freshness");
});

it("copies native-history presentation choices while retaining resolved store and date defaults", async () => {
  const original = window.location.href;
  const writeText = vi.fn(async (_text: string) => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  try {
    window.history.replaceState(null, "", "/overview?metric=spend&show_trends=all&store=unapplied");
    render(
      <ReportHeader
        {...props}
        mode="sample"
        storeId="resolved-store"
        params={{ metric: "revenue", range: "last-28-days" }}
        clientPresentationParams={["metric", "show_trends"]}
        view={{
          range: { from: "2026-09-01", to: "2026-09-28" },
          issue: null,
          derived: {},
          live: { from: null, to: null, range: null },
          fixed: { from: "2026-09-01", to: "2026-09-28", range: "last-28-days" },
        }}
      />,
      { wrapper: TooltipProvider },
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy report link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = new URL(writeText.mock.calls[0]?.[0] ?? "");
    expect(Object.fromEntries(copied.searchParams)).toEqual({
      store: "resolved-store",
      from: "2026-09-01",
      to: "2026-09-28",
      // The pinned dates name the preset they are, so comparisons keep its meaning.
      range: "last-28-days",
      metric: "spend",
      show_trends: "all",
    });
    await screen.findByText("Report link copied.");
    window.history.replaceState(null, "", "/overview?metric=revenue");
    fireEvent.click(screen.getByRole("button", { name: "Copy report link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(new URL(writeText.mock.calls[1]?.[0] ?? "").searchParams.has("show_trends")).toBe(false);
  } finally {
    window.history.replaceState(null, "", original);
  }
});

it.each(["?baseline=b", "?metric=spend&baseline=b"])(
  "copies the displayed chart default from its associated form, preserving applied scope (%s)",
  async (query) => {
    const original = window.location.href;
    const writeText = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    try {
      window.history.replaceState(null, "", `/overview${query}`);
      render(
        <>
          <ReportHeader
            {...props}
            mode="sample"
            storeId="resolved-store"
            clientPresentationParams={["metric", "baseline"]}
            view={{
              range: { from: "2026-09-01", to: "2026-09-28" },
              issue: null,
              derived: {},
              live: { from: null, to: null, range: null },
              fixed: { from: "2026-09-01", to: "2026-09-28", range: null },
            }}
          />
          <form id={REPORT_FILTER_FORM_ID}>
            <input name="store" defaultValue="draft-store" />
            <input name="from" defaultValue="2020-01-01" />
          </form>
          <input type="hidden" name="metric" value="revenue" form={REPORT_FILTER_FORM_ID} />
        </>,
        { wrapper: TooltipProvider },
      );
      fireEvent.click(screen.getByRole("button", { name: "Copy report link" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      expect(Object.fromEntries(new URL(writeText.mock.calls[0]?.[0] ?? "").searchParams)).toEqual({
        store: "resolved-store",
        from: "2026-09-01",
        to: "2026-09-28",
        metric: "revenue",
        baseline: "b",
      });
      expect(window.location.search).toBe(query);
    } finally {
      window.history.replaceState(null, "", original);
      vi.unstubAllGlobals();
    }
  },
);
