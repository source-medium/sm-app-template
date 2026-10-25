import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EmptyState, ErrorState, WarehouseErrorState } from "@/components/patterns/data-states";
import { WarehouseError } from "@/lib/data/warehouse-error";

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

it("offers the way out of an empty result as a link", () => {
  render(
    <EmptyState message="No rows match." action={{ href: "/overview?store=a", label: "Show all sales channels" }} />,
  );
  expect(screen.getByRole("link", { name: "Show all sales channels" })).toHaveAttribute("href", "/overview?store=a");
});

it("shows a selectable support code for failures and rejects arbitrary text", () => {
  const id = "47ca1e6b-fa2c-4e96-aa86-39801bb3dbeb";
  const { rerender } = render(
    <ErrorState title="SourceMedium refused this request" remedy="Contact support." requestId={id} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(`Support code: ${id}`);
  expect(screen.getByText(id)).toHaveClass("select-all");
  rerender(
    <ErrorState
      title="SourceMedium refused this request"
      remedy="Contact support."
      requestId="private-provider-text"
    />,
  );
  expect(screen.queryByText(/Support code|private-provider-text/)).toBeNull();
});

it("shows a warehouse failure's own state: the named column, or its remedy and support code", () => {
  const { rerender } = render(<WarehouseErrorState error={WarehouseError.incompatible("dim_stores", "store_name")} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Column store_name in dim_stores is missing or has a different type",
  );
  const duplicate = new WarehouseError("incompatible_schema", {
    relation: "dim_stores",
    reason: "duplicate_store_ids",
    remedy: "The store list (dim_stores) names a store more than once.",
    requestId: "47ca1e6b-fa2c-4e96-aa86-39801bb3dbeb",
  });
  rerender(<WarehouseErrorState error={duplicate} />);
  expect(screen.getByRole("alert")).toHaveTextContent("The store list (dim_stores) names a store more than once.");
  expect(screen.getByRole("alert")).not.toHaveTextContent("missing or has a different type");
  expect(screen.getByText("47ca1e6b-fa2c-4e96-aa86-39801bb3dbeb")).toBeInTheDocument();
});
