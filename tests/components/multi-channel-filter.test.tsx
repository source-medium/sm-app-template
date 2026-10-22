import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MultiChannelFilter, SalesChannelFilter } from "@/components/patterns/multi-channel-filter";
import { LoadingState } from "@/components/patterns/data-states";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

it("keeps one form value through roster loading and applies a quick choice before submitting", () => {
  const content = (ready: boolean) => (
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters">
        <input name="from" defaultValue="2026-09-01" />
      </form>
      <SalesChannelFilter value="Online DTC">
        {ready ? (
          <MultiChannelFilter channels={["Amazon", "Online DTC"]} />
        ) : (
          <LoadingState variant="control" label="Loading sales channels" />
        )}
      </SalesChannelFilter>
    </>
  );
  const { rerender } = render(content(false));
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  expect(new FormData(form).getAll("sales_channel")).toEqual(["Online DTC"]);
  rerender(content(true));
  expect(new FormData(form).getAll("sales_channel")).toEqual(["Online DTC"]);
  let submitted: FormData | undefined;
  vi.spyOn(form, "requestSubmit").mockImplementation(() => {
    submitted = new FormData(form);
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Sales channel" }), { target: { value: "Amazon" } });
  expect(submitted?.getAll("sales_channel")).toEqual(["Amazon"]);
  expect(submitted?.get("from")).toBe("2026-09-01");
});
it("encodes a multi-selection once and keeps an unknown applied value available", () => {
  render(
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters" />
      <SalesChannelFilter value="Unknown">
        <MultiChannelFilter channels={["Amazon", "Online DTC"]} />
      </SalesChannelFilter>
    </>,
  );
  expect(screen.getByRole("option", { name: "Unknown" })).toBeInTheDocument();
  fireEvent.click(screen.getByText("Choose multiple channels"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Unknown" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Online DTC" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Amazon" }));
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  expect(new FormData(form).getAll("sales_channel")).toEqual(['["Amazon","Online DTC"]']);
});

it("keeps the applied channel visible while checkbox changes wait for Apply", () => {
  render(
    <>
      <form id={REPORT_FILTER_FORM_ID} aria-label="Report filters" />
      <SalesChannelFilter value="Online DTC">
        <MultiChannelFilter channels={["Amazon", "Online DTC"]} />
      </SalesChannelFilter>
    </>,
  );
  fireEvent.click(screen.getByText("Choose multiple channels"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Amazon" }));
  const select = screen.getByRole("combobox", { name: "Sales channel" });
  expect(select).toHaveValue("Online DTC");
  expect(screen.getByRole("status")).toHaveTextContent("Channel changes not applied.");
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Report filters" });
  expect(new FormData(form).getAll("sales_channel")).toEqual(['["Amazon","Online DTC"]']);
  // Returning the draft to the applied selection clears the notice without a request.
  fireEvent.click(screen.getByRole("checkbox", { name: "Amazon" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(select).toHaveValue("Online DTC");
});
