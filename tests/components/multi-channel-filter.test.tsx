import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MultiChannelFilter, SalesChannelFilter } from "@/components/patterns/multi-channel-filter";
import { LoadingState } from "@/components/patterns/data-states";
import { ReportNavigationProvider } from "@/components/shell/report-navigation";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

const { router, navigationModule } = await vi.hoisted(() => import("../helpers/navigation"));
vi.mock("next/navigation", () => navigationModule());
beforeEach(() => router.reset());

it("keeps one form value through roster loading and applies a quick choice by itself", () => {
  router.search = "store=a&from=2026-09-01&to=2026-09-07&sales_channel=Online+DTC";
  const content = (ready: boolean) => (
    <ReportNavigationProvider>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters">
        {/* An invalid date draft neither travels with the channel nor blocks it. */}
        <input name="from" defaultValue="2026-09-09" />
      </form>
      <SalesChannelFilter value="Online DTC">
        {ready ? (
          <MultiChannelFilter channels={["Amazon", "Online DTC"]} />
        ) : (
          <LoadingState variant="control" label="Loading sales channels" />
        )}
      </SalesChannelFilter>
    </ReportNavigationProvider>
  );
  const { rerender } = render(content(false));
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  expect(new FormData(form).getAll("sales_channel")).toEqual(["Online DTC"]);
  rerender(content(true));
  expect(new FormData(form).getAll("sales_channel")).toEqual(["Online DTC"]);
  const select = screen.getByRole("combobox", { name: "Sales channel" });
  fireEvent.change(select, { target: { value: "Amazon" } });
  expect(router.push).toHaveBeenCalledExactlyOnceWith(
    "/overview?store=a&from=2026-09-01&to=2026-09-07&sales_channel=Amazon",
    { scroll: false },
  );
  // The choice shows at once; it is on its way, not an unapplied draft.
  expect(select).toHaveValue("Amazon");
  expect(screen.queryByRole("status")).toBeNull();
});

it("applies All as an explicit choice, so a configured default cannot return", () => {
  router.search = "store=a&sales_channel=Online+DTC";
  render(
    <ReportNavigationProvider>
      <SalesChannelFilter value="Online DTC">
        <MultiChannelFilter channels={["Amazon", "Online DTC"]} />
      </SalesChannelFilter>
    </ReportNavigationProvider>,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Sales channel" }), { target: { value: "" } });
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/overview?store=a&sales_channel=", { scroll: false });
});

it("applies several channels together with Apply channels, and only them", () => {
  router.search = "store=a&compare=year";
  render(
    <ReportNavigationProvider>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters">
        <input name="compare" defaultValue="previous" />
      </form>
      <SalesChannelFilter value={null}>
        <MultiChannelFilter channels={["Amazon", "Online DTC"]} />
      </SalesChannelFilter>
    </ReportNavigationProvider>,
  );
  fireEvent.click(screen.getByText("Choose multiple channels"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Online DTC" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Amazon" }));
  expect(screen.getByRole("status")).toHaveTextContent("Channel changes not applied.");
  fireEvent.click(screen.getByRole("button", { name: "Apply channels" }));
  expect(router.push).toHaveBeenCalledExactlyOnceWith(
    `/overview?${new URLSearchParams({ store: "a", compare: "year", sales_channel: '["Amazon","Online DTC"]' })}`,
    { scroll: false },
  );
  expect(screen.getByRole("combobox", { name: "Sales channel" })).toHaveValue("__multiple");
  expect(screen.queryByRole("status")).toBeNull();
});
it("encodes a multi-selection once and keeps an unknown applied value available", () => {
  render(
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters" />
      <SalesChannelFilter value="Unknown">
        <MultiChannelFilter channels={["Amazon", "Online DTC"]} />
      </SalesChannelFilter>
    </>,
  );
  expect(screen.getByRole("option", { name: "Unknown" })).toBeInTheDocument();
  fireEvent.click(screen.getByText("Choose multiple channels"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Unknown" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Online DTC" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Amazon" }));
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  expect(new FormData(form).getAll("sales_channel")).toEqual(['["Amazon","Online DTC"]']);
});

it("keeps the applied channel visible while checkbox changes wait for Apply", () => {
  render(
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters" />
      <SalesChannelFilter value="Online DTC">
        <MultiChannelFilter channels={["Amazon", "Online DTC"]} />
      </SalesChannelFilter>
    </>,
  );
  fireEvent.click(screen.getByText("Choose multiple channels"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Amazon" }));
  const select = screen.getByRole("combobox", { name: "Sales channel" });
  expect(select).toHaveValue("Online DTC");
  expect(screen.getByRole("status")).toHaveTextContent("Channel changes not applied.");
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  expect(new FormData(form).getAll("sales_channel")).toEqual(['["Amazon","Online DTC"]']);
  // Returning the draft to the applied selection clears the notice without a request.
  fireEvent.click(screen.getByRole("checkbox", { name: "Amazon" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(select).toHaveValue("Online DTC");
});
