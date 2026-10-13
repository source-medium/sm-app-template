import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { StoreSwitcher } from "@/components/shell/store-switcher";

const push = vi.fn();
beforeEach(() => push.mockClear());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const stores = [
  {
    id: "a",
    label: "US",
    brand: "First brand",
    domain: "first.example.com",
    logoUrl: null,
    timeZone: "America/New_York",
    currency: null,
  },
  {
    id: "b",
    label: "US",
    brand: "Second brand",
    domain: "second.example.com",
    logoUrl: "https://cdn.example.com/store.png",
    timeZone: "America/Los_Angeles",
    currency: null,
  },
  {
    id: "c",
    label: "UK",
    brand: "First brand",
    domain: "first.example.com",
    logoUrl: null,
    timeZone: "Europe/London",
    currency: "GBP",
  },
];
function setup(fixedStore = false) {
  return render(
    <>
      <div id="report-store-switcher" />
      <StoreSwitcher
        stores={fixedStore ? stores.slice(0, 1) : stores}
        storeId="a"
        pathname="/overview"
        params={{ from: "2026-09-01", to: "2026-09-07", campaign: "old" }}
        fixedStore={fixedStore}
      />
    </>,
  );
}
it("searches names, brands and IDs, disambiguates duplicate names and keeps the applied label", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Store: US (a)" }));
  const dialog = screen.getByRole("dialog", { name: "Switch store" });
  expect(within(dialog).getByRole("region", { name: "First brand" })).toContainElement(
    within(dialog).getByRole("button", { name: "UK" }),
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "Search stores" }), { target: { value: "second brand" } });
  expect(within(dialog).queryByRole("button", { name: "UK" })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "US (b)" }));
  expect(push).toHaveBeenLastCalledWith("/overview?from=2026-09-01&to=2026-09-07&store=b", { scroll: false });
  expect(screen.getByRole("button", { name: "Store: US (a)" })).toHaveAttribute("data-store-id", "a");
  expect(screen.getByRole("button", { name: "Store: US (a)" })).toHaveAttribute("data-store-name", "US");
});
it("keeps fixed stores visible but not switchable", () => {
  setup(true);
  expect(screen.getByRole("button", { name: "Store: US" })).toBeDisabled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("reselecting the applied store closes the picker without dropping report filters", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Store: US (a)" }));
  fireEvent.click(screen.getByRole("dialog").querySelector('[data-store-option="a"]') as HTMLElement);
  expect(push).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("searches website domains even when a store has a name, and keeps All stores available", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Store: US (a)" }));
  const dialog = screen.getByRole("dialog", { name: "Switch store" });
  const search = screen.getByRole("searchbox", { name: "Search stores" });
  fireEvent.change(search, { target: { value: "SECOND.example" } });
  const option = within(dialog).getByRole("button", { name: "US (b)" });
  expect(option).toHaveTextContent("second.example.com · b");
  expect(within(dialog).queryByRole("button", { name: "US (a)" })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "All stores" })).toBeVisible();
  fireEvent.change(search, { target: { value: "no-match" } });
  expect(within(dialog).getByRole("status")).toHaveTextContent("No matching stores");
  fireEvent.click(within(dialog).getByRole("button", { name: "Clear search" }));
  expect(search).toHaveValue("");
  expect(search).toHaveFocus();
  expect(within(dialog).getByRole("button", { name: "US (a)" })).toHaveAttribute("aria-current", "page");
});

it("supports arrow navigation between search, matching stores, and All stores", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Store: US (a)" }));
  const search = screen.getByRole("searchbox", { name: "Search stores" });
  fireEvent.change(search, { target: { value: "second.example" } });
  fireEvent.keyDown(search, { key: "ArrowDown" });
  const option = screen.getByRole("button", { name: "US (b)" });
  expect(option).toHaveFocus();
  fireEvent.keyDown(option, { key: "ArrowDown" });
  const all = screen.getByRole("button", { name: "All stores" });
  expect(all).toHaveFocus();
  fireEvent.keyDown(all, { key: "ArrowDown" });
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: "ArrowUp" });
  expect(all).toHaveFocus();
  fireEvent.keyDown(all, { key: "Home" });
  expect(option).toHaveFocus();
  fireEvent.keyDown(option, { key: "ArrowUp" });
  expect(search).toHaveFocus();
});

it("shows configured logos and replaces broken images with initials without losing the store", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Store: US (a)" }));
  const option = screen.getByRole("button", { name: "US (b)" });
  const image = option.querySelector("img");
  if (!image) throw new Error("The configured store logo did not render");
  expect(image).toHaveAttribute("src", "https://cdn.example.com/store.png");
  expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  fireEvent.error(image);
  expect(option.querySelector("img")).toBeNull();
  expect(option).toBeEnabled();
  fireEvent.click(option);
  expect(push).toHaveBeenCalledWith("/overview?from=2026-09-01&to=2026-09-07&store=b", { scroll: false });
});
