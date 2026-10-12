import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { AcquisitionDimensionFilter, AcquisitionSegmentFilter } from "./segmentation-controls";

it("clears the old dimension's value and search before submitting the existing report form", () => {
  let submitted: FormData | undefined;
  render(
    <>
      <form
        id={REPORT_FILTER_FORM_ID}
        onSubmit={(event) => {
          event.preventDefault();
          submitted = new FormData(event.currentTarget);
        }}
      >
        <input type="hidden" name="store" value="sample-store-a" />
      </form>
      <AcquisitionDimensionFilter dimension="campaign" />
      <AcquisitionSegmentFilter segment="Prospecting" search="prospect" values={["Prospecting"]} truncated={false} />
    </>,
  );
  fireEvent.change(screen.getByLabelText("Segment cohorts by"), { target: { value: "discount_code" } });
  expect(submitted?.get("store")).toBe("sample-store-a");
  expect(submitted?.get("acquisition_dimension")).toBe("discount_code");
  expect(submitted?.get("acquisition_segment")).toBe("");
  expect(submitted?.get("segment_search")).toBe("");
});

it("keeps an applied value visible when a narrowed or partial options list excludes it", () => {
  render(<AcquisitionSegmentFilter segment="Existing campaign" search="brand" values={["Brand search"]} truncated />);
  expect(screen.getByLabelText("Acquisition segment")).toHaveValue("Existing campaign");
  expect(screen.getByText(/first 200 matching segments/)).toBeVisible();
});
