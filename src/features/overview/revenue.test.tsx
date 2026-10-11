import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { revenueDifference, OverviewRevenue } from "./revenue";

it("adds signed deductions exactly, preserves missing inputs, and exposes a mismatch", () => {
  const value = {
    gross: "9007199254740993.123456789",
    discounts: "-0.1",
    refunds: "-0.02",
    net: "9007199254740993.003456789",
  };
  expect(revenueDifference(value)).toBe("0");
  expect(revenueDifference({ ...value, net: "9007199254740992.003456789" })).toBe("-1");
  expect(revenueDifference({ ...value, refunds: null })).toBeNull();
  const html = renderToStaticMarkup(
    <OverviewRevenue
      current={{ ...value, net: "9007199254740992.003456789" }}
      previous={null}
      compare={false}
      currency="USD"
    />,
  );
  expect(html).toContain("Unreconciled difference");
});
