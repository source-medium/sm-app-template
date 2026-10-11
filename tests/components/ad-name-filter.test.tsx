import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AdNameFilter } from "@/components/patterns/ad-name-filter";
import {
  NAME_FILTER_SIZE_ERROR,
  parseAdNameFilters,
  serializeAdNameFilters,
  type AdNameRule,
} from "@/lib/ad-name-filters";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
beforeEach(() => push.mockClear());

it.each(["Unicode", "combined rules"])("keeps an oversized %s draft editable without navigating", (kind) => {
  const rules: AdNameRule[] =
    kind === "combined rules"
      ? [{ field: "campaign", operator: "contains", values: Array<string>(10).fill("a".repeat(200)) }]
      : [];
  const params = { store: "sample-store-a", channel: "Meta", names: serializeAdNameFilters(rules) ?? undefined };
  render(<AdNameFilter pathname="/paid-marketing" params={params} rules={rules} error={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Add name filter" }));
  const values = screen.getByLabelText("Values, one per line");
  const draft = Array<string>(10)
    .fill((kind === "Unicode" ? "語" : "b").repeat(200))
    .join("\n");
  fireEvent.change(values, { target: { value: draft } });
  fireEvent.click(screen.getByRole("button", { name: "Apply name filter" }));
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(NAME_FILTER_SIZE_ERROR);
  expect(values).toHaveValue(draft);
  expect(values).toHaveAccessibleDescription(expect.stringContaining(NAME_FILTER_SIZE_ERROR));

  fireEvent.change(values, { target: { value: "[retargeting]" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply name filter" }));
  expect(push).toHaveBeenCalledTimes(1);
  const destination = push.mock.calls[0]?.[0];
  if (typeof destination !== "string") throw new Error("Missing filter navigation");
  const url = new URL(destination, "https://example.test");
  expect(url.searchParams.get("store")).toBe(params.store);
  expect(url.searchParams.get("channel")).toBe(params.channel);
  expect(parseAdNameFilters(Object.fromEntries(url.searchParams))).toEqual({
    rules: [...rules, { field: "campaign", operator: "contains", values: ["[retargeting]"] }],
    error: null,
  });
});
