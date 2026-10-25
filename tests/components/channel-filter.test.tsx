import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { expect, it, vi } from "vitest";
import { ChannelRosterFilter } from "@/components/patterns/channel-filter";
import { DataRegion } from "@/components/patterns/data-region";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { WarehouseError } from "@/lib/data/warehouse-error";

vi.mock("@/lib/auth/require-viewer", () => ({
  requireViewer: async () => ({
    mode: "live",
    request: { id: "r", bypassCache: false, provenance: { oldestQueriedAt: null, servedFromCache: 0 } },
  }),
}));

/** The roster region ChannelRosterFilter streams, rendered once its load settles. */
async function renderRoster(props: ComponentProps<typeof ChannelRosterFilter>) {
  const region = (ChannelRosterFilter(props).props as { children: ReactElement<ComponentProps<typeof DataRegion>> })
    .children;
  render(
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters" />
      {await DataRegion(region.props)}
    </>,
  );
  return new FormData(screen.getByRole<HTMLFormElement>("form", { name: "Report filters" }));
}

it("keeps the applied channel selectable and submitted when its roster fails", async () => {
  const submitted = await renderRoster({
    load: async () => {
      throw new WarehouseError("quota_exceeded", { status: 403, reason: "quotaExceeded" });
    },
    value: "Online DTC",
    loadingLabel: "Loading sales channels",
  });
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("Sales channel")).toHaveValue("Online DTC");
  expect(submitted.getAll("sales_channel")).toEqual(["Online DTC"]);
});

it("names a channel list carried from a multi-channel report by its channels", async () => {
  await renderRoster({ load: async () => ["Amazon"], value: '["Amazon","Online DTC"]', loadingLabel: "Loading" });
  expect(screen.getByRole("option", { name: "Amazon, Online DTC" })).toHaveValue('["Amazon","Online DTC"]');
  expect(screen.getByRole("option", { name: "Amazon" })).toBeInTheDocument();
});
