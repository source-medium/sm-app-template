import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { SavedViews } from "@/components/shell/saved-views";
import { ShareReport } from "@/components/shell/share-report";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SAVED_REPORTS_KEY } from "@/lib/saved-reports";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

const path = appConfig.nav[0]?.href ?? "/";
beforeEach(() => {
  // The sidebar asks whether it is on a phone; jsdom has no media queries.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function Sidebar() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <SavedViews current="/" />
      </SidebarProvider>
    </TooltipProvider>
  );
}

it("saves applied scope and live presentation from Share, lists it in the sidebar, and removes it there", async () => {
  render(
    <>
      <ShareReport
        shareHref={`${path}?store=applied&from=2026-01-01&to=2026-01-07`}
        saveHref={`${path}?store=applied&range=last-7-days`}
        clientPresentationParams={["metric"]}
      />
      <form id={REPORT_FILTER_FORM_ID}>
        <input name="store" defaultValue="draft" />
        <input name="from" defaultValue="2020-01-01" />
        <input name="metric" defaultValue="units" />
      </form>
      <Sidebar />
    </>,
  );
  expect(screen.queryByRole("list", { name: "Saved views" })).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Share" }));
  fireEvent.change(screen.getByLabelText("Save in this browser as"), { target: { value: "Weekly sales" } });
  fireEvent.submit(screen.getByRole("form", { name: "Save this view" }));
  expect(screen.getByText("Saved. Find it under Saved views in the sidebar.")).toBeInTheDocument();
  const link = await screen.findByRole("link", { name: /^Weekly sales/ });
  const url = new URL(link.getAttribute("href") ?? "", window.location.origin);
  expect(Object.fromEntries(url.searchParams)).toEqual({ store: "applied", range: "last-7-days", metric: "units" });
  fireEvent.change(screen.getByLabelText("Save in this browser as"), { target: { value: "weekly SALES" } });
  fireEvent.submit(screen.getByRole("form", { name: "Save this view" }));
  expect(screen.getByText(/already exists/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove Weekly sales" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: /^Weekly sales/ })).toBeNull());
  expect(JSON.parse(localStorage.getItem(SAVED_REPORTS_KEY) ?? "null")).toEqual([]);
});

it("says when storage refuses a removal, keeps the view, and follows changes from another tab", async () => {
  localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify([{ id: "one", name: "Existing", href: path }]));
  render(<Sidebar />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  fireEvent.click(await screen.findByRole("button", { name: "Remove Existing" }));
  expect(screen.getByText("Could not remove. Browser storage may be unavailable.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Existing/ })).toBeInTheDocument();
  vi.restoreAllMocks();
  localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify([{ id: "two", name: "Another tab", href: path }]));
  fireEvent(window, new StorageEvent("storage", { key: SAVED_REPORTS_KEY }));
  expect(await screen.findByRole("link", { name: /^Another tab/ })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /^Existing/ })).toBeNull();
});

it("says when storage refuses a save", async () => {
  render(<ShareReport shareHref={path} saveHref={path} />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  fireEvent.click(await screen.findByRole("button", { name: "Share" }));
  fireEvent.change(screen.getByLabelText("Save in this browser as"), { target: { value: "Blocked" } });
  fireEvent.submit(screen.getByRole("form", { name: "Save this view" }));
  expect(screen.getByRole("status")).toHaveTextContent("Could not save");
});
