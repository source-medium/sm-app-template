import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EmptyState, ErrorState } from "@/components/patterns/data-states";

it("keeps the alert contract for both tones and styles only the frame by tone", () => {
  const { rerender } = render(<ErrorState title="Check the month" remedy="Choose a month that has already ended." />);
  const alert = screen.getByRole("alert");
  expect(alert).toHaveAttribute("data-slot", "data-error");
  expect(alert.firstElementChild).toHaveClass("border-destructive/40");
  rerender(<ErrorState tone="warning" title="Check the month" remedy="Choose a month that has already ended." />);
  expect(screen.getByRole("alert")).toHaveAttribute("data-slot", "data-error");
  expect(screen.getByRole("alert").firstElementChild).toHaveClass("border-warning/40");
  expect(screen.getByRole("alert").firstElementChild).not.toHaveClass("border-destructive/40");
  expect(screen.getByText("Choose a month that has already ended.")).toBeInTheDocument();
});

it("names a state that is not an empty result when asked to", () => {
  const { rerender } = render(<EmptyState message="No rows match." />);
  expect(screen.getByText("No data")).toBeInTheDocument();
  rerender(<EmptyState title="Choose a segment to load its cohorts" message="Pick one above." />);
  expect(screen.queryByText("No data")).toBeNull();
  expect(screen.getByText("Choose a segment to load its cohorts")).toBeInTheDocument();
});
