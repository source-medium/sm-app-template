import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { ReportPage } from "@/components/shell/report-page";
import { REPORT_FILTER_FORM_ID, reportDates } from "@/lib/filters";
import PerformancePage from "./page";

// Hold the request boundary open so the real page renders its loading fallback.
vi.mock("@/lib/auth/require-viewer", () => ({ requireViewer: () => new Promise(() => {}) }));

it("keeps the selected platform in the report form while platform data loads", async () => {
  const frame = await PerformancePage({
    searchParams: Promise.resolve({ view: "platforms", platform: "Meta", sales_channel: "Online DTC" }),
  });
  const { children } = frame.props as ComponentProps<typeof ReportPage>;
  const html = renderToString(
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters" />
      {children({
        filters: { storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-07" } },
        params: {},
        dates: reportDates({}, { from: "2026-09-01", to: "2026-09-07" }, null),
        today: "2026-10-22",
        timeZone: "UTC",
        currency: "USD",
      })}
    </>,
  );
  render(<div dangerouslySetInnerHTML={{ __html: html }} />);
  expect(screen.getByRole("status", { name: "Loading platform performance" })).toBeVisible();
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  expect(new FormData(form).getAll("platform")).toEqual(["Meta"]);
  expect(new FormData(form).getAll("sales_channel")).toEqual(["Online DTC"]);
});
