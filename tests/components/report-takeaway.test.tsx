import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ReportTakeaway } from "@/components/patterns/report-takeaway";

const props = { metric: "Net revenue", value: "$100.00", range: { from: "2026-09-01", to: "2026-09-07" } };
it("names the exact period and comparison without inferring causes", () => {
  render(
    <ReportTakeaway
      {...props}
      change={{
        display: "+$10.00 (+11.11%)",
        label: "vs previous 7 days",
        direction: "up",
        good: true,
        comparedTo: "$90.00",
      }}
    />,
  );
  expect(screen.getByLabelText("Report takeaway")).toHaveTextContent(
    "Net revenue: $100.00 for Sep 1, 2026 – Sep 7, 2026. +$10.00 (+11.11%) vs previous 7 days.",
  );
});
it("explains unavailable comparisons instead of presenting a misleading delta", () => {
  render(
    <ReportTakeaway
      {...props}
      change={{
        display: "Changes hidden",
        label: "vs previous 7 days",
        unavailable: true,
        direction: null,
        good: null,
        comparedTo: "",
      }}
      issue="The comparison period has no rows"
    />,
  );
  expect(screen.getByLabelText("Report takeaway")).toHaveTextContent(
    "Comparison unavailable vs previous 7 days: The comparison period has no rows.",
  );
});
