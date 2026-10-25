import { act, renderHook, waitFor } from "@testing-library/react";
import { useInsertionEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePresentationParams, writePresentationUrl } from "@/hooks/use-presentation-params";

// The router can still expose the server's query while browser history has moved on.
const router = vi.hoisted(() => ({ search: "metric=server" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(router.search) }));

const original = window.location.href;
beforeEach(() => {
  router.search = "metric=server";
  window.history.replaceState(null, "", "/overview?store=a&metric=revenue#trends");
});
afterEach(() => window.history.replaceState(null, "", original));

it("synchronizes every chart control from the browser URL even when the router's query is stale", () => {
  const { result } = renderHook(() => [usePresentationParams(), usePresentationParams()]);
  expect(result.current.map((params) => params.get("metric"))).toEqual(["revenue", "revenue"]);
  const entries = window.history.length;
  act(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("show_trends", "all");
    writePresentationUrl(url, "replace");
  });
  expect(result.current.map((params) => params.get("show_trends"))).toEqual(["all", "all"]);
  expect(result.current.map((params) => params.get("store"))).toEqual(["a", "a"]);
  expect(window.location.hash).toBe("#trends");
  expect(window.history.length).toBe(entries);
});

it("restores presentation on Back and Forward without a server navigation", async () => {
  const { result } = renderHook(() => usePresentationParams());
  act(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("metric", "orders");
    writePresentationUrl(url);
  });
  expect(result.current.get("metric")).toBe("orders");
  act(() => window.history.back());
  await waitFor(() => expect(result.current.get("metric")).toBe("revenue"));
  act(() => window.history.forward());
  await waitFor(() => expect(result.current.get("metric")).toBe("orders"));
  expect(result.current.get("store")).toBe("a");
});

it("follows a router navigation that commits its URL after the chart renders", () => {
  const { result, rerender } = renderHook(
    ({ search }) => {
      // Next's HistoryUpdater writes the address in an insertion effect.
      useInsertionEffect(() => {
        window.history.replaceState(null, "", `/overview?${search}`);
      }, [search]);
      return usePresentationParams();
    },
    { initialProps: { search: "store=a&metric=revenue" } },
  );
  expect(result.current.get("metric")).toBe("revenue");
  router.search = "store=b&metric=orders";
  rerender({ search: router.search });
  expect(window.location.search).toBe("?store=b&metric=orders");
  expect(result.current.get("metric")).toBe("orders");
  expect(result.current.get("store")).toBe("b");
});
