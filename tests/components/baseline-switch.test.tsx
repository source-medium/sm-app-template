import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActiveBaseline, BaselineProvider, BaselineSwitch } from "@/components/patterns/baseline-switch";
import { writePresentationUrl } from "@/hooks/use-presentation-params";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

const router = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(router.search) }));

const original = window.location.href;
beforeEach(() => {
  router.search = "";
  window.history.replaceState(null, "", "/overview?store=a");
});
afterEach(() => window.history.replaceState(null, "", original));

function report(available: [boolean, boolean] = [true, true]) {
  return (
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters" />
      <BaselineProvider available={available}>
        <BaselineSwitch labels={["Previous period", "Last year"]} available={available} />
        <ActiveBaseline a={<p>First overlay</p>} b={<p>Second overlay</p>} />
      </BaselineProvider>
    </>
  );
}

it("restores the baseline and submitted value on Back and Forward interleaved with chart choices", async () => {
  render(report());
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  const entries = window.history.length;
  fireEvent.click(screen.getByRole("button", { name: "Last year" }));
  expect(window.history.length).toBe(entries);
  expect(screen.getByText("Second overlay")).toBeVisible();
  expect(new FormData(form).get("baseline")).toBe("b");
  act(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("metric", "orders");
    writePresentationUrl(url);
  });
  fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
  expect(screen.getByText("First overlay")).toBeVisible();
  expect(new FormData(form).has("baseline")).toBe(false);
  act(() => window.history.back());
  await waitFor(() => expect(screen.getByText("Second overlay")).toBeVisible());
  expect(screen.getByRole("button", { name: "Last year" })).toHaveAttribute("aria-pressed", "true");
  expect(new FormData(form).get("baseline")).toBe("b");
  act(() => window.history.forward());
  await waitFor(() => expect(screen.getByText("First overlay")).toBeVisible());
  expect(new FormData(form).has("baseline")).toBe(false);
  expect(new URL(window.location.href).searchParams.get("metric")).toBe("orders");
});

it.each([
  { requested: "b", available: [true, true], overlay: "Second overlay" },
  { requested: "b", available: [true, false], overlay: "First overlay" },
  { requested: "invalid", available: [true, true], overlay: "First overlay" },
  { requested: "a", available: [false, true], overlay: "Second overlay" },
  { requested: "b", available: [false, false], overlay: "First overlay" },
])("normalizes a link's $requested baseline against $available", ({ requested, available, overlay }) => {
  router.search = `baseline=${requested}`;
  window.history.replaceState(null, "", `/overview?${router.search}`);
  render(report(available as [boolean, boolean]));
  expect(screen.getByText(overlay)).toBeVisible();
});

it("updates the overlay and submitted baseline when a navigation changes the available periods", () => {
  window.history.replaceState(null, "", "/overview?baseline=b");
  const view = render(report());
  expect(screen.getByText("Second overlay")).toBeVisible();
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  view.rerender(report([true, false]));
  expect(screen.getByText("First overlay")).toBeVisible();
  expect(new FormData(form).has("baseline")).toBe(false);
  view.rerender(report([false, true]));
  expect(screen.getByText("Second overlay")).toBeVisible();
  expect(new FormData(form).get("baseline")).toBe("b");
});

it("hydrates the server's baseline without a mismatch and accepts choices only after hydration", async () => {
  router.search = "baseline=b";
  window.history.replaceState(null, "", `/overview?${router.search}`);
  const element = report();
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.append(container);
  expect(screen.getByText("Second overlay")).toBeVisible();
  expect(screen.getByRole("button", { name: "Last year", hidden: true })).toHaveAttribute("inert");
  const errors = vi.fn();
  const root = hydrateRoot(container, element, { onRecoverableError: errors });
  try {
    await act(async () => {});
    const selected = screen.getByRole("button", { name: "Last year" });
    expect(selected).not.toHaveAttribute("inert");
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Second overlay")).toBeVisible();
    const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
    expect(new FormData(form).get("baseline")).toBe("b");
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
    expect(screen.getByText("First overlay")).toBeVisible();
    expect(new URL(window.location.href).searchParams.has("baseline")).toBe(false);
    expect(new FormData(form).has("baseline")).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
