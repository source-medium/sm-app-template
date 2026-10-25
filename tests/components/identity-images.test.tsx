import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StoreAvatar } from "@/components/patterns/store-avatar";

it("keeps store initials when a logo is missing or fails, and recovers for the next store", () => {
  const view = render(<StoreAvatar label="Sample Store" logoUrl={null} />);
  expect(screen.getByText("SS")).toBeInTheDocument();
  view.rerender(<StoreAvatar label="Sample Store" logoUrl="https://cdn.example.com/store.svg" />);
  const logo = view.container.querySelector("img");
  if (!logo) throw new Error("Expected the configured store logo");
  expect(logo).toHaveAttribute("referrerpolicy", "no-referrer");
  fireEvent.error(logo);
  expect(screen.getByText("SS")).toBeInTheDocument();
  view.rerender(<StoreAvatar label="Other Store" logoUrl="https://cdn.example.com/other.svg" />);
  expect(view.container.querySelector("img")).toHaveAttribute("src", "https://cdn.example.com/other.svg");
});
