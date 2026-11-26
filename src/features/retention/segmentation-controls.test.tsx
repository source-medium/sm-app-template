import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReportNavigationProvider } from "@/components/shell/report-navigation";
import { AcquisitionDimensionFilter, AcquisitionSegmentFilter } from "./segmentation-controls";

const { router, navigationModule } = await vi.hoisted(() => import("../../../tests/helpers/navigation"));
vi.mock("next/navigation", () => navigationModule());
beforeEach(() => router.reset());

it("clears the old dimension's value and search when the dimension changes", () => {
  router.pathname = "/retention";
  router.search =
    "store=sample-store-a&acquisition_dimension=campaign&acquisition_segment=Prospecting&segment_search=prospect";
  render(
    <ReportNavigationProvider>
      <AcquisitionDimensionFilter dimension="campaign" />
      <AcquisitionSegmentFilter segment="Prospecting" search="prospect" values={["Prospecting"]} truncated={false} />
    </ReportNavigationProvider>,
  );
  fireEvent.change(screen.getByLabelText("Segment cohorts by"), { target: { value: "discount_code" } });
  expect(router.push).toHaveBeenCalledExactlyOnceWith(
    "/retention?store=sample-store-a&acquisition_dimension=discount_code",
    { scroll: false },
  );
});

it("keeps an applied value visible when a narrowed or partial options list excludes it", () => {
  render(<AcquisitionSegmentFilter segment="Existing campaign" search="brand" values={["Brand search"]} truncated />);
  expect(screen.getByLabelText("Acquisition segment")).toHaveValue("Existing campaign");
  expect(screen.getByText(/first 200 matching segments/)).toBeVisible();
});
