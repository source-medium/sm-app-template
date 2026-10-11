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
