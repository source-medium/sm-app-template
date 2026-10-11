import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { StoreSwitcher } from "@/components/shell/store-switcher";

const push = vi.fn();
beforeEach(() => push.mockClear());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const stores = [
  { id: "a", label: "US", brand: "First brand", timeZone: "America/New_York", currency: null },
  { id: "b", label: "US", brand: "Second brand", timeZone: "America/Los_Angeles", currency: null },
  { id: "c", label: "UK", brand: "First brand", timeZone: "Europe/London", currency: "GBP" },
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
