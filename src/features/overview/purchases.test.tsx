import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { OverviewPurchases } from "./purchases";
import { formatMoney, EMPTY_VALUE } from "@/lib/format";

it("uses each group's own order measure for its ratio, including fractional counts", () => {
  render(
    <OverviewPurchases
      current={{
        first: { netRevenue: "150", orders: 1.5 },
        repeat: { netRevenue: "240", orders: 2 },
      }}
      previous={null}
    />,
  );
  const table = screen.getByRole("table", { name: "New vs repeat purchases" });
  const first = within(table).getByRole("row", { name: /New-customer orders/ });
  const repeat = within(table).getByRole("row", { name: /Repeat-customer orders/ });
  expect(within(first).getAllByRole("cell")[3]).toHaveTextContent(formatMoney(100));
  expect(within(repeat).getAllByRole("cell")[3]).toHaveTextContent(formatMoney(120));
  expect(within(table).queryByRole("columnheader", { name: "Revenue change" })).not.toBeInTheDocument();
});

it("keeps exact revenue and missing measures intact; zero orders have no ratio", () => {
  render(
    <OverviewPurchases
      current={{
        first: { netRevenue: "123456789012345678.123456789", orders: 0 },
        repeat: { netRevenue: null, orders: null },
      }}
      previous={null}
      comparedTo="Prior period"
    />,
  );
  const first = screen.getByRole("row", { name: /New-customer orders/ });
  const repeat = screen.getByRole("row", { name: /Repeat-customer orders/ });
  expect(within(first).getAllByRole("cell")[1]).toHaveTextContent(formatMoney("123456789012345678.123456789"));
  expect(within(first).getAllByRole("cell")[3]).toHaveTextContent(EMPTY_VALUE);
  for (const cell of within(repeat).getAllByRole("cell").slice(1, 4)) expect(cell).toHaveTextContent(EMPTY_VALUE);
});
