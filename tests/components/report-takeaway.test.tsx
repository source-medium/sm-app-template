import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ReportTakeaway } from "@/components/patterns/report-takeaway";
import type { KpiDelta } from "@/components/patterns/kpi-card";

const props = { metric: "Net revenue", value: "$100.00", baseline: "previous 7 days" };
const change: KpiDelta = {
  display: "+$10.00 (+11.11%)",
  short: "+11.11%",
  label: "vs previous 7 days",
  direction: "up",
  good: true,
  comparedTo: "$90.00",
};

it("names the change and the comparison without inferring causes", () => {
  render(<ReportTakeaway {...props} change={change} />);
  expect(screen.getByLabelText("Report takeaway")).toHaveTextContent(
    "Net revenue rose 11.11% to $100.00 against the previous 7 days.",
  );
});
it("reads a fall and a held value in the same sentence", () => {
  const { rerender } = render(<ReportTakeaway {...props} change={{ ...change, direction: "down", short: "-10%" }} />);
  expect(screen.getByLabelText("Report takeaway")).toHaveTextContent(
    "Net revenue fell 10% to $100.00 against the previous 7 days.",
  );
  rerender(<ReportTakeaway {...props} change={{ ...change, direction: "flat", short: undefined }} />);
  expect(screen.getByLabelText("Report takeaway")).toHaveTextContent(
    "Net revenue held at $100.00 against the previous 7 days.",
  );
});
it("keeps a change with no percentage in its full form", () => {
  render(<ReportTakeaway {...props} change={{ ...change, display: "+$10.00 (zero baseline)", short: undefined }} />);
  expect(screen.getByLabelText("Report takeaway")).toHaveTextContent(
    "Net revenue: $100.00. +$10.00 (zero baseline) vs previous 7 days.",
  );
});
it("falls back to the row's own label without the comparison's name", () => {
  render(<ReportTakeaway metric="Net revenue" value="$100.00" change={change} />);
  expect(screen.getByLabelText("Report takeaway")).toHaveTextContent(
    "Net revenue rose 11.11% to $100.00 vs previous 7 days.",
  );
});
it("states the value alone without a comparison", () => {
  render(<ReportTakeaway {...props} />);
  expect(screen.getByLabelText("Report takeaway")).toHaveTextContent("Net revenue: $100.00.");
});
it("says nothing rather than a misleading delta when the comparison is unavailable", () => {
  // The comparison caption gives the reason once; the KPI cards still show the value.
  const { container } = render(
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
    />,
  );
  expect(screen.queryByLabelText("Report takeaway")).toBeNull();
  expect(container).toBeEmptyDOMElement();
});
