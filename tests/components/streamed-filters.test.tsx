import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ChannelRosterFilter } from "@/components/patterns/channel-filter";
import { OverviewControls } from "@/features/overview/controls";
import { RetentionSegmentControls } from "@/features/retention/controls";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

// Hold the request boundary open so the actual controls render their loading fallback.
vi.mock("@/lib/auth/require-viewer", () => ({ requireViewer: () => new Promise(() => {}) }));

it.each([
  {
    label: "Sales channel",
    loading: "Loading sales channels",
    fields: { sales_channel: "Online DTC" },
    controls: (
      <OverviewControls
        filters={{ storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-07" }, channel: "Online DTC" }}
      />
    ),
  },
  {
    label: "Acquisition segment",
    loading: "Loading acquisition segments",
    fields: { acquisition_segment: "Prospecting", segment_search: "brand" },
    controls: (
      <RetentionSegmentControls
        filters={{
          storeId: "sample-store-a",
          asOf: "2026-09",
          dimension: "campaign",
          segment: "Prospecting",
          channel: "online_dtc",
          search: "brand",
        }}
      />
    ),
  },
  {
    label: "Single sales channel",
    loading: "Loading sales channels",
    fields: { sales_channel: "Online DTC" },
    controls: (
      <ChannelRosterFilter
        load={() => new Promise(() => {})}
        value="Online DTC"
        loadingLabel="Loading sales channels"
      />
    ),
  },
  {
    label: "Ad channel",
    loading: "Loading ad channels",
    fields: { channel: "Meta" },
    controls: (
      <ChannelRosterFilter
        load={() => new Promise(() => {})}
        value="Meta"
        name="channel"
        label="Ad channel"
        allLabel="All ad channels"
        loadingLabel="Loading ad channels"
      />
    ),
  },
])("submitting during $label loading preserves the applied scope", ({ controls, loading, fields }) => {
  const html = renderToString(
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters">
        <input type="hidden" name="store" value="sample-store-a" />
      </form>
      {controls}
    </>,
  );
  render(<div dangerouslySetInnerHTML={{ __html: html }} />);
  expect(screen.getByRole("status", { name: loading })).toBeVisible();
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  const submitted = new FormData(form);
  expect(submitted.get("store")).toBe("sample-store-a");
  for (const [name, value] of Object.entries(fields)) expect(submitted.getAll(name)).toEqual([value]);
});
