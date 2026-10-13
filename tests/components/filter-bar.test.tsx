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

it("keeps the date fields behind the applied range on phones until someone changes them", () => {
  render(
    <FilterBar
      pathname="/overview"
      storeId="a"
      from="2026-09-01"
      to="2026-09-07"
      maxDate="2026-10-01"
      presets={[]}
      rangeLabel="Sep 1, 2026 – Sep 7, 2026"
    />,
  );
  const change = screen.getByRole("button", { name: "Change dates, Sep 1, 2026 – Sep 7, 2026" });
  expect(change).toHaveTextContent("Sep 1, 2026 – Sep 7, 2026");
  // The collapsed fields still carry the applied dates into the request.
  const form = screen.getByRole("form", { name: "Report filters" }) as HTMLFormElement;
  expect(new FormData(form).get("from")).toBe("2026-09-01");
  expect(new FormData(form).get("to")).toBe("2026-09-07");
  const fields = screen.getByLabelText("From").closest("div.col-span-full");
  expect(fields).toHaveClass("max-sm:hidden");
  fireEvent.click(change);
  expect(screen.queryByRole("button", { name: /^Change dates/ })).toBeNull();
  expect(screen.getByLabelText("From")).toHaveFocus();
  expect(screen.getByLabelText("From").closest("div.col-span-full")).not.toHaveClass("max-sm:hidden");
  // An invalid draft opens the fields so the correction is visible, and the field takes focus once shown.
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-09" } });
  fireEvent.submit(form);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("From")).toHaveFocus();
});
