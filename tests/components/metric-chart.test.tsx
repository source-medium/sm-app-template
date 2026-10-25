import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChart, resolveMetric, type ChartMetric } from "@/components/charts/metric-chart";
import { ChartMemoryProvider } from "@/components/charts/chart-memory";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CHART_MEMORY_COOKIE, parseChartMemory } from "@/lib/chart-memory";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

// The URL is the page's; native history updates it, as Next's router does in the app.
vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const metric = (key: string, label: string, plottable = true): ChartMetric => ({
  key,
  label,
  series: [{ key, label, color: "red" }],
  data: [{ label: "Oct 1", [key]: 1, [`${key}__display`]: `${label} value` }],
  plottable,
});
const METRICS = [metric("revenue", "Net revenue"), metric("orders", "Summary orders"), metric("spend", "Ad spend")];

function chart(memory: Record<string, string> = {}, metrics = METRICS) {
  return (
    <TooltipProvider>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters" />
      <ChartMemoryProvider initial={memory}>
        <MetricChart
          param="metric"
          titleSuffix="by day"
          kind="line"
          categoryHeader="Date"
          description="Selected period"
          metrics={metrics}
        />
      </ChartMemoryProvider>
    </TooltipProvider>
  );
}

function cookieMemory() {
  const raw = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CHART_MEMORY_COOKIE}=`))
    ?.slice(CHART_MEMORY_COOKIE.length + 1);
  return parseChartMemory(raw);
}

/** Runs the deferred URL and memory sync. */
function flush() {
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

function choose(label: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: /^Measure:/ }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}

describe("resolveMetric", () => {
  const keys = ["revenue", "orders", "spend"];
  it.each([
    ["a link's measure wins over memory", "spend", "orders", "spend"],
    ["memory applies without a link", null, "orders", "orders"],
    ["an unknown link value falls back to memory", "bogus", "orders", "orders"],
    ["a measure the chart no longer offers is ignored", null, "sessions", "revenue"],
    ["the first measure is the default", null, undefined, "revenue"],
  ])("%s", (_, fromUrl, remembered, expected) => {
    expect(resolveMetric(fromUrl, remembered, keys)).toBe(expected);
  });
});

describe("MetricChart", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    window.history.replaceState(null, "", "/overview?store=a");
    document.cookie = `${CHART_MEMORY_COOKIE}=; Path=/; Max-Age=0`;
    // jsdom has no layout; give the real responsive chart a measurable container.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 640,
      height: 256,
      top: 0,
      left: 0,
      bottom: 256,
      right: 640,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("leaves the default out of the URL, and exposes it for filter submits and copied links", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    const view = render(chart());
    expect(screen.getByRole("img", { name: "Net revenue by day chart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Measure: Net revenue" })).toHaveTextContent("Net revenue");
    flush();
    expect(window.location.search).toBe("?store=a");
    expect(push).not.toHaveBeenCalled();
    expect(cookieMemory()).toEqual({ "/overview:metric": "revenue" });
    const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
    expect(new FormData(form).getAll("metric")).toEqual(["revenue"]);
    choose("Summary orders");
    expect(String(replace.mock.calls.at(-1)?.[2])).toMatch(/[?&]metric=revenue$/);
    view.rerender(chart());
    expect(screen.getByRole("img", { name: "Summary orders by day chart" })).toBeInTheDocument();
    // Back restores the named entry.
    window.history.replaceState(null, "", "/overview?store=a&metric=revenue");
    view.rerender(chart());
    flush();
    expect(screen.getByRole("img", { name: "Net revenue by day chart" })).toBeInTheDocument();
    expect(cookieMemory()).toEqual({ "/overview:metric": "revenue" });
  });

  it("switches without a request, records the choice in the URL and the cookie, and keeps it in filter submits", () => {
    const push = vi.spyOn(window.history, "pushState");
    const view = render(chart());
    choose("Summary orders");
    view.rerender(chart());
    expect(push).toHaveBeenCalledTimes(1);
    expect(new URL(window.location.href).searchParams.get("metric")).toBe("orders");
    expect(cookieMemory()).toEqual({ "/overview:metric": "orders" });
    expect(screen.getByRole("img", { name: "Summary orders by day chart" })).toBeInTheDocument();
    const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
    expect(new FormData(form).getAll("metric")).toEqual(["orders"]);
  });

  it("paints a remembered measure and names it in the URL so a copied link matches", () => {
    const push = vi.spyOn(window.history, "pushState");
    render(chart({ "/overview:metric": "spend" }));
    expect(screen.getByRole("img", { name: "Ad spend by day chart" })).toBeInTheDocument();
    flush();
    expect(new URL(window.location.href).searchParams.get("metric")).toBe("spend");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a link's measure and remembers it, so links that omit the param resume it", () => {
    window.history.replaceState(null, "", "/overview?store=a&metric=orders");
    render(chart({ "/overview:metric": "spend" }));
    expect(screen.getByRole("img", { name: "Summary orders by day chart" })).toBeInTheDocument();
    flush();
    expect(cookieMemory()).toEqual({ "/overview:metric": "orders" });
    expect(window.location.search).toBe("?store=a&metric=orders");
  });

  it("keeps a link's explicit default through filter submits when this browser remembers another measure", () => {
    window.history.replaceState(null, "", "/overview?store=a&metric=revenue");
    render(chart({ "/overview:metric": "spend" }));
    expect(screen.getByRole("img", { name: "Net revenue by day chart" })).toBeInTheDocument();
    const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
    expect(new FormData(form).getAll("metric")).toEqual(["revenue"]);
  });

  it("uses a measure's own description, and the card's when the measure has none", () => {
    const view = render(
      chart({}, [{ ...metric("revenue", "Net revenue"), description: undefined }, metric("orders", "Summary orders")]),
    );
    expect(screen.getByText("Selected period")).toBeInTheDocument();
    view.rerender(chart({}, [{ ...metric("revenue", "Net revenue"), description: "Revenue only" }]));
    expect(screen.getByText("Revenue only")).toBeInTheDocument();
    expect(screen.queryByText("Selected period")).not.toBeInTheDocument();
  });

  it("keeps the table view across measures and opens the table for one that cannot be plotted", () => {
    const metrics = [...METRICS, metric("huge", "Huge count", false)];
    const view = render(chart({}, metrics));
    fireEvent.click(screen.getByRole("button", { name: "View as table" }));
    choose("Summary orders");
    view.rerender(chart({}, metrics));
    expect(screen.getByRole("table", { name: "Summary orders by day" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View as chart" }));
    choose("Huge count");
    view.rerender(chart({}, metrics));
    expect(screen.getByRole("table", { name: "Huge count by day" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View as chart" })).not.toBeInTheDocument();
  });

  it("renders a plain title, keeping the card's description and the URL, when there is only one measure", () => {
    render(chart({}, [{ ...metric("revenue", "Net revenue"), description: undefined }]));
    expect(screen.getByRole("img", { name: "Net revenue by day chart" })).toBeInTheDocument();
    expect(screen.getByText("Selected period")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Measure:/ })).not.toBeInTheDocument();
    flush();
    expect(window.location.search).toBe("?store=a");
    expect(cookieMemory()).toEqual({});
  });

  it("accepts no choice until hydrated, so an early click is never silently lost", () => {
    const server = render(<div dangerouslySetInnerHTML={{ __html: renderToString(chart()) }} />);
    expect(screen.getByRole("button", { name: "Measure: Net revenue", hidden: true })).toHaveAttribute("inert");
    server.unmount();
    render(chart());
    expect(screen.getByRole("button", { name: "Measure: Net revenue" })).not.toHaveAttribute("inert");
  });
});
