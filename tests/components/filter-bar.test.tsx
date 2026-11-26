import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";
import { ReportNavigationProvider } from "@/components/shell/report-navigation";

const { router, navigationModule } = await vi.hoisted(() => import("../helpers/navigation"));
vi.mock("next/navigation", () => navigationModule());
beforeEach(() => router.reset());

const comparing = (
  <ReportNavigationProvider>
    <FilterBar
      pathname="/overview"
      storeId="a"
      from="2026-09-01"
      to="2026-09-07"
      maxDate="2026-10-01"
      presets={[]}
      rangeLabel="Sep 1, 2026 – Sep 7, 2026"
      comparison="previous"
      comparison2="year"
      comparison2Default="year"
    />
  </ReportNavigationProvider>
);

it("applies a comparison by itself while an invalid date draft waits in its fields", () => {
  router.search = "store=a&from=2026-09-01&to=2026-09-07&sales_channel=amazon";
  render(comparing);
  fireEvent.click(screen.getByRole("button", { name: /^Change dates/ }));
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-09" } });
  fireEvent.change(screen.getByLabelText("Compare with"), { target: { value: "weekday" } });
  expect(router.push).toHaveBeenCalledExactlyOnceWith(
    "/overview?store=a&from=2026-09-01&to=2026-09-07&sales_channel=amazon&compare=weekday",
    { scroll: false },
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText("From")).toHaveValue("2026-09-09");
});

it("leaves a second comparison at its default out of the URL", () => {
  router.search = "store=a&compare2=weekday";
  render(comparing);
  fireEvent.click(screen.getByRole("button", { name: /^Change dates/ }));
  fireEvent.change(screen.getByLabelText("Second comparison"), { target: { value: "year" } });
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/overview?store=a", { scroll: false });
});

it("applies typed dates with Apply and keeps a choice already on its way", () => {
  router.search = "store=a&from=2026-09-01&to=2026-09-07";
  render(comparing);
  fireEvent.click(screen.getByRole("button", { name: /^Change dates/ }));
  fireEvent.change(screen.getByLabelText("Compare with"), { target: { value: "weekday" } });
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-02" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(router.push).toHaveBeenLastCalledWith("/overview?store=a&from=2026-09-02&to=2026-09-07&compare=weekday", {
    scroll: false,
  });
});

it("submits the applied store and rejects invalid date drafts", () => {
  const { container } = render(
    <FilterBar pathname="/overview" storeId="a" from="2026-09-01" to="2026-09-07" maxDate="2026-10-01" presets={[]} />,
  );
  expect(container.querySelector('input[name="store"]')).toHaveValue("a");
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-09" } });
  fireEvent.submit(screen.getByRole("form", { name: "Report filters" }));
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("From")).toHaveFocus();
  expect(container.querySelector('input[name="store"]')).toHaveValue("a");
});

it("keeps the date fields behind the applied range until someone changes them", () => {
  render(
    <FilterBar
      pathname="/overview"
      storeId="a"
      from="2026-09-01"
      to="2026-09-07"
      maxDate="2026-10-01"
      presets={[]}
      rangeLabel="Sep 1, 2026 – Sep 7, 2026"
      comparison="previous"
      comparison2="year"
      comparisonLabel="Compare spend breakdown with"
    />,
  );
  // The comparison shown on the button is part of its name (WCAG 2.5.3, label in name).
  const change = screen.getByRole("button", {
    name: "Change dates, Sep 1, 2026 – Sep 7, 2026 vs previous period and same period last year",
  });
  expect(change).toHaveTextContent("Sep 1, 2026 – Sep 7, 2026 vs previous period and same period last year");
  expect(change).toHaveAttribute("aria-expanded", "false");
  // The collapsed fields still carry the applied dates into the request.
  const form = screen.getByRole("form", { name: "Report filters" }) as HTMLFormElement;
  expect(new FormData(form).get("from")).toBe("2026-09-01");
  expect(new FormData(form).get("to")).toBe("2026-09-07");
  expect(new FormData(form).get("compare")).toBe("previous");
  expect(screen.getByLabelText("From")).not.toBeVisible();
  fireEvent.click(change);
  expect(change).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByLabelText("From")).toBeVisible();
  expect(screen.getByLabelText("From")).toHaveFocus();
  expect(screen.getByLabelText("Compare spend breakdown with")).toBeVisible();
  fireEvent.click(change);
  expect(screen.getByLabelText("From")).not.toBeVisible();
  // An invalid draft opens the fields so the correction is visible, and the field takes focus once shown.
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-09" } });
  fireEvent.submit(form);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("From")).toBeVisible();
  expect(screen.getByLabelText("From")).toHaveFocus();
});

it("names an unset comparison and starts open when a suggested range needs applying", () => {
  render(
    <FilterBar
      pathname="/overview"
      storeId="a"
      from="2026-09-01"
      to="2026-09-07"
      maxDate="2026-10-01"
      presets={[]}
      rangeLabel="Sep 1, 2026 – Sep 7, 2026"
      comparison="off"
      defaultOpen
    />,
  );
  expect(screen.getByRole("button", { name: /^Change dates/ })).toHaveAccessibleName(/ No comparison$/);
  expect(screen.getByLabelText("From")).toBeVisible();
});

it("keeps frequent presets and the active one on the line, and the rest with the date fields", () => {
  const preset = (label: string, { active = false, quick = false } = {}) => ({
    label,
    href: "/overview",
    active,
    quick,
  });
  render(
    <FilterBar
      pathname="/overview"
      storeId="a"
      from="2026-09-01"
      to="2026-09-07"
      maxDate="2026-10-01"
      presets={[
        preset("Last 7 days", { quick: true }),
        preset("Last 28 days", { quick: true }),
        preset("Last month", { active: true }),
        preset("Yesterday"),
      ]}
      rangeLabel="Sep 1, 2026 – Sep 7, 2026"
    />,
  );
  const line = screen.getByRole("navigation", { name: "Date presets" });
  expect(line).toHaveTextContent("Last 7 days");
  expect(line).toHaveTextContent("Last month");
  expect(line).not.toHaveTextContent("Yesterday");
  fireEvent.click(screen.getByRole("button", { name: /^Change dates/ }));
  expect(screen.getByRole("navigation", { name: "More date presets" })).toHaveTextContent("Yesterday");
});
