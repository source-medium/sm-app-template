import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { FilterBar } from "@/components/shell/filter-bar";

const firstStore = { id: "a", label: "US", brand: "First brand" };
const props = {
  pathname: "/overview",
  storeId: "a",
  from: "2026-09-01",
  to: "2026-09-07",
  maxDate: "2026-10-01",
  presets: [],
  stores: [
    firstStore,
    { id: "b", label: "US", brand: "Second brand" },
    { id: "c", label: "UK", brand: "First brand" },
    { id: "d", label: "Unnamed store", brand: null },
  ],
};

it("groups names by brand and disambiguates equal names while submitting stable store IDs", () => {
  render(<FilterBar {...props} />);
  const picker = screen.getByRole("combobox", { name: "Store" });
  const first = within(picker).getByRole("group", { name: "First brand" });
  expect(within(first).getByRole("option", { name: "US (a)" })).toHaveValue("a");
  expect(within(first).getByRole("option", { name: "UK" })).toHaveValue("c");
  expect(within(picker).getByRole("option", { name: "US (b)" })).toHaveValue("b");
  expect(within(picker).getByRole("option", { name: "Unnamed store" })).toHaveValue("d");
  fireEvent.change(picker, { target: { value: "b" } });
  expect(picker).toHaveValue("b");
});

it("keeps a fixed store disabled and submits its ID through the existing hidden field", () => {
  const { container } = render(<FilterBar {...props} stores={[firstStore]} fixedStore />);
  expect(screen.getByRole("combobox", { name: "Store" })).toBeDisabled();
  expect(container.querySelector('input[name="store"]')).toHaveValue("a");
  expect(screen.queryByRole("option", { name: "US (b)" })).not.toBeInTheDocument();
});
