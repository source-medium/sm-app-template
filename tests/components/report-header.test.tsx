import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReportHeader } from "@/components/shell/report-header";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const props = {
  title: "Revenue",
  description: "Published sales",
  pathname: "/overview",
  params: {},
  dates: true,
  agentFilters: {},
  agentOmissions: [],
  sources: [],
};

it("places freshness and currency uncertainty beside the report title", () => {
  const { container, rerender } = render(<ReportHeader {...props} mode="live" />, { wrapper: TooltipProvider });
  const trust = container.querySelector('[data-slot="report-trust"]');
  expect(trust).toHaveTextContent("Warehouse freshness: unknown");
  expect(trust).toHaveTextContent("Currency unverified; amounts are unlabeled");
  expect(screen.getByRole("heading", { name: "Revenue" }).parentElement).toContainElement(trust as HTMLElement);
  rerender(<ReportHeader {...props} mode="live" currency="CAD" />);
  expect(trust).toHaveTextContent("Reporting currency: CAD");
  expect(trust).not.toHaveTextContent("unverified");
  rerender(<ReportHeader {...props} mode="live" allStores />);
  expect(trust).toHaveTextContent("Currencies shown per store; no combined totals");
  rerender(<ReportHeader {...props} mode="sample" currency="USD" />);
  expect(trust).toHaveTextContent("Synthetic sample data");
  expect(trust).not.toHaveTextContent("Warehouse freshness");
});
