import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NativeSelect } from "@/components/ui/native-select";

it("preserves selected filter values if the form is submitted before hydration", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    <form>
      <NativeSelect name="store" defaultValue="store-b" onChange={() => {}}>
        <option value="store-a">A</option>
        <option value="store-b">B</option>
      </NativeSelect>
    </form>,
  );
  const form = container.querySelector("form");
  if (!form) throw new Error("Expected a form");
  expect(new FormData(form).get("store")).toBe("store-b");
});

it("keeps a JS-driven select inert until hydration attaches its change handler", async () => {
  const onChange = vi.fn();
  const element = (
    <NativeSelect aria-label="Filter" onChange={onChange} defaultValue="a">
      <option value="a">A</option>
      <option value="b">B</option>
    </NativeSelect>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.append(container);
  expect(container.querySelector("select")).toHaveAttribute("inert");
  const errors = vi.fn();
  const root = hydrateRoot(container, element, { onRecoverableError: errors });
  await act(async () => {});
  expect(container.querySelector("select")).not.toHaveAttribute("inert");
  fireEvent.change(screen.getByLabelText("Filter"), { target: { value: "b" } });
  expect(onChange).toHaveBeenCalledOnce();
  expect(errors).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  container.remove();
});

it("preserves explicit disabled state and native forms that do not need change handlers", () => {
  render(
    <NativeSelect aria-label="Fixed store" disabled onChange={() => {}}>
      <option>Only store</option>
    </NativeSelect>,
  );
  expect(screen.getByLabelText("Fixed store")).toBeDisabled();
  const html = renderToString(
    <NativeSelect name="plain">
      <option>A</option>
    </NativeSelect>,
  );
  expect(new DOMParser().parseFromString(html, "text/html").querySelector("select")?.disabled).toBe(false);
});
