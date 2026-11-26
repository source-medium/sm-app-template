import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  ReportBusy,
  ReportNavigationProvider,
  ReportPendingStatus,
  useReportNavigation,
} from "@/components/shell/report-navigation";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

const { router, navigationModule } = await vi.hoisted(() => import("../helpers/navigation"));
vi.mock("next/navigation", () => navigationModule());
beforeEach(() => router.reset());

function Controls() {
  const { navigate, go } = useReportNavigation();
  return (
    <>
      <button onClick={() => navigate({ sales_channel: "amazon" })}>Amazon</button>
      <button onClick={() => navigate({ compare: "year" })}>Last year</button>
      <button onClick={() => navigate({ sales_channel: null })}>Applied channel</button>
      <button onClick={() => go("/overview?store=a&range=last-7-days")}>Last 7 days</button>
      <button onClick={() => go("/products?store=a")}>Products</button>
    </>
  );
}

function renderReport() {
  render(
    <ReportNavigationProvider>
      <ReportPendingStatus />
      <Controls />
      <ReportBusy>
        <p>Report</p>
      </ReportBusy>
    </ReportNavigationProvider>,
  );
}

/** A navigation that has not committed yet, as Next.js's router keeps one pending in its transition. */
function holdNavigations() {
  router.push.mockImplementation(() => new Promise(() => {}));
  router.replace.mockImplementation(() => new Promise(() => {}));
}

it("builds a second choice on one still on its way, so neither undoes the other", async () => {
  router.search = "store=a&range=last-28-days&cursor=next";
  holdNavigations();
  renderReport();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Amazon" })));
  expect(router.push).toHaveBeenLastCalledWith("/overview?store=a&range=last-28-days&sales_channel=amazon", {
    scroll: false,
  });
  expect(screen.getByRole("status")).toHaveTextContent("Updating…");
  expect(screen.getByText("Report").parentElement).toHaveAttribute("aria-busy", "true");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Last year" })));
  expect(router.push).toHaveBeenLastCalledWith(
    "/overview?store=a&range=last-28-days&sales_channel=amazon&compare=year",
    { scroll: false },
  );
  // A link built from the applied URL keeps both choices and adds its own.
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Last 7 days" })));
  expect(router.push).toHaveBeenLastCalledWith(
    "/overview?store=a&range=last-7-days&sales_channel=amazon&compare=year",
    {
      scroll: false,
    },
  );
});

it("replaces a change on its way when the viewer returns to the applied choice", async () => {
  router.search = "store=a";
  holdNavigations();
  renderReport();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Amazon" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Applied channel" })));
  expect(router.replace).toHaveBeenCalledExactlyOnceWith("/overview?store=a", { scroll: false });
});

it("opens another view without carrying this report's choices", async () => {
  router.search = "store=a";
  holdNavigations();
  renderReport();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Amazon" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Products" })));
  expect(router.push).toHaveBeenLastCalledWith("/products?store=a", { scroll: false });
});

it("keeps what the report applied without the URL naming it, and leaves drafts for Apply", async () => {
  router.search = "from=2026-09-01";
  render(
    <ReportNavigationProvider>
      <form id={REPORT_FILTER_FORM_ID}>
        {/* The store the page chose, and the measure a chart shows by default. */}
        <input type="hidden" name="store" value="a" />
        <input type="hidden" name="metric" value="revenue" />
        <input type="hidden" name="sales_channel" value='["amazon","retail"]' data-draft />
        <input name="to" defaultValue="2026-09-30" />
      </form>
      <Controls />
    </ReportNavigationProvider>,
  );
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Last year" })));
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/overview?from=2026-09-01&store=a&metric=revenue&compare=year", {
    scroll: false,
  });
});

it("follows a link exactly where it says, adding nothing the page applied", async () => {
  router.search = "store=a&from=2026-09-01&to=2026-09-07";
  render(
    <ReportNavigationProvider>
      <form id={REPORT_FILTER_FORM_ID}>
        <input type="hidden" name="metric" value="revenue" />
      </form>
      <Controls />
    </ReportNavigationProvider>,
  );
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Last 7 days" })));
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/overview?store=a&range=last-7-days", { scroll: false });
});

it("says nothing and holds nothing back when no change is on its way", () => {
  renderReport();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByText("Report").parentElement).not.toHaveAttribute("aria-busy");
});
