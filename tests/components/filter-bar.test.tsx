import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";

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
  const change = screen.getByRole("button", { name: "Change dates, Sep 1, 2026 – Sep 7, 2026" });
  expect(change).toHaveTextContent("Sep 1, 2026 – Sep 7, 2026");
  expect(change).toHaveAccessibleDescription("vs previous period and same period last year");
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
  expect(screen.getByRole("button", { name: /^Change dates/ })).toHaveAccessibleDescription("No comparison");
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
