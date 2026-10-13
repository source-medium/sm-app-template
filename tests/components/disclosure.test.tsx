import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Disclosure } from "@/components/ui/disclosure";

it("is a native details element whose summary carries the given text and can be controlled", () => {
  const onToggle = vi.fn();
  const { container, rerender } = render(
    <Disclosure summary="Revenue and deductions" aria-label="Revenue detail" onToggle={onToggle}>
      <p>Body</p>
    </Disclosure>,
  );
  const details = container.querySelector("details");
  if (!details) throw new Error("Disclosure must render a details element");
  expect(details).toHaveAttribute("aria-label", "Revenue detail");
  expect(details).not.toHaveAttribute("open");
  expect(screen.getByText("Revenue and deductions").tagName).toBe("SUMMARY");
  fireEvent(details, new Event("toggle"));
  expect(onToggle).toHaveBeenCalledTimes(1);
  rerender(
    <Disclosure summary="Revenue and deductions" open>
      <p>Body</p>
    </Disclosure>,
  );
  expect(details).toHaveAttribute("open");
});
