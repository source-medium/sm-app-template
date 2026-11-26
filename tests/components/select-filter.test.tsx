import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SelectFilter } from "@/components/patterns/select-filter";
import { ReportNavigationProvider } from "@/components/shell/report-navigation";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

const { router, navigationModule } = await vi.hoisted(() => import("../helpers/navigation"));
vi.mock("next/navigation", () => navigationModule());
beforeEach(() => router.reset());

const grain = (
  <SelectFilter
    name="grain"
    label="Summary rows"
    value="day"
    options={[
      { value: "day", label: "Daily" },
      { value: "week", label: "Weekly" },
    ]}
  />
);

it("applies only its own choice as soon as it changes, leaving drafts and the applied dates alone", () => {
  router.search = "store=a&from=2026-09-01&to=2026-09-07&grain=day&cursor=next";
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
  render(
    <ReportNavigationProvider>
      <form id={REPORT_FILTER_FORM_ID} onSubmit={onSubmit}>
        {/* An invalid draft in another field neither travels with the choice nor blocks it. */}
        <input name="from" defaultValue="2026-09-09" />
      </form>
      {grain}
    </ReportNavigationProvider>,
  );
  const select = screen.getByLabelText("Summary rows") as HTMLSelectElement;
  // Still a field of the report form, so an explicit Apply elsewhere keeps the choice.
  expect(select.form?.id).toBe(REPORT_FILTER_FORM_ID);
  fireEvent.change(select, { target: { value: "week" } });
  expect(onSubmit).not.toHaveBeenCalled();
  // A row position belongs to the old results.
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/overview?store=a&from=2026-09-01&to=2026-09-07&grain=week", {
    scroll: false,
  });
  expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
});

it("clears the keys a new choice invalidates", () => {
  router.search = "store=a&dimension=product&entity=p-1";
  render(
    <ReportNavigationProvider>
      <SelectFilter
        name="dimension"
        label="Group by"
        value="product"
        clear={["entity"]}
        options={[
          { value: "product", label: "Product" },
          { value: "variant", label: "Variant" },
        ]}
      />
    </ReportNavigationProvider>,
  );
  fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "variant" } });
  expect(router.push).toHaveBeenCalledExactlyOnceWith("/overview?store=a&dimension=variant", { scroll: false });
});

it("makes no request when the applied choice is chosen again", () => {
  router.search = "store=a&grain=day";
  render(<ReportNavigationProvider>{grain}</ReportNavigationProvider>);
  fireEvent.change(screen.getByLabelText("Summary rows"), { target: { value: "day" } });
  expect(router.push).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
