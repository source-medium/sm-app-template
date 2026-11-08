import { expect, it } from "vitest";
import { productNames } from "./names";

it("shows a reference only where two products share a name", () => {
  const rows = [
    { label: "Shaker", reference: "shopify / p9" },
    { label: "Sample pack", reference: "shopify / p12" },
    { label: "Sample pack", reference: "amazon / p40" },
  ];
  const name = productNames(rows);
  expect(rows.map(name)).toEqual(["Shaker", "Sample pack (shopify / p12)", "Sample pack (amazon / p40)"]);
});
