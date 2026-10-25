import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { SavedReports } from "@/components/shell/saved-reports";
import { SAVED_REPORTS_KEY } from "@/lib/saved-reports";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

const path = appConfig.nav[0]?.href ?? "/";
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it("saves applied scope and live presentation, persists through remount, and removes a named view", async () => {
  const view = render(
    <>
      <SavedReports href={`${path}?store=applied&range=last-7-days`} clientPresentationParams={["metric"]} />
      <form id={REPORT_FILTER_FORM_ID}>
        <input name="store" defaultValue="draft" />
        <input name="from" defaultValue="2020-01-01" />
        <input name="metric" defaultValue="units" />
      </form>
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Saved views" }));
  fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Weekly sales" } });
  fireEvent.submit(screen.getByRole("form", { name: "Save current report view" }));
  const link = await screen.findByRole("link", { name: /^Weekly sales/ });
  const url = new URL(link.getAttribute("href") ?? "", window.location.origin);
  expect(Object.fromEntries(url.searchParams)).toEqual({ store: "applied", range: "last-7-days", metric: "units" });
  fireEvent.change(screen.getByLabelText("View name"), { target: { value: "weekly SALES" } });
  fireEvent.submit(screen.getByRole("form", { name: "Save current report view" }));
  expect(screen.getByRole("status")).toHaveTextContent("already exists");
  view.unmount();
  render(<SavedReports href={path} clientPresentationParams={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Saved views" }));
  expect(screen.getByRole("link", { name: /^Weekly sales/ })).toHaveAttribute(
    "href",
    `${path}?store=applied&range=last-7-days&metric=units`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove Weekly sales" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: /^Weekly sales/ })).toBeNull());
  expect(JSON.parse(localStorage.getItem(SAVED_REPORTS_KEY) ?? "null")).toEqual([]);
  expect(screen.getByLabelText("View name")).toHaveFocus();
});

it("shows storage errors without losing existing views and follows changes from another tab", async () => {
  localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify([{ id: "one", name: "Existing", href: path }]));
  render(<SavedReports href={path} clientPresentationParams={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Saved views" }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove Existing" }));
  expect(screen.getByRole("status")).toHaveTextContent("Could not save changes");
  expect(screen.getByRole("link", { name: /^Existing/ })).toBeInTheDocument();
  vi.restoreAllMocks();
  localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify([{ id: "two", name: "Another tab", href: path }]));
  fireEvent(window, new StorageEvent("storage", { key: SAVED_REPORTS_KEY }));
  expect(await screen.findByRole("link", { name: /^Another tab/ })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /^Existing/ })).toBeNull();
});
