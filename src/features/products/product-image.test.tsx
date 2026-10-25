import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProductImage } from "./product-image";
import { DataTable } from "@/components/patterns/data-table";

it("preserves a product link and its sortable text when its decorative image fails", () => {
  const view = render(
    <DataTable
      caption="Products"
      columns={[{ key: "name", header: "Product" }]}
      rows={[
        {
          id: "p1",
          cells: {
            name: {
              display: "Daily blend",
              href: "/products?entity=p1",
              leading: <ProductImage src="https://cdn.example.com/product.jpg" />,
            },
          },
        },
      ]}
    />,
  );
  const image = view.container.querySelector("img");
  if (!image) throw new Error("Expected the configured product image");
  fireEvent.error(image);
  expect(view.container.querySelector("img")).toBeNull();
  expect(screen.getByRole("link", { name: "Daily blend" })).toHaveAttribute("href", "/products?entity=p1");
  fireEvent.click(screen.getByRole("button", { name: /Product/ }));
  expect(screen.getByRole("cell", { name: "Daily blend" })).toBeInTheDocument();
});
