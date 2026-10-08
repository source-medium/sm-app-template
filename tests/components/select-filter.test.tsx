import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SelectFilter } from "@/components/patterns/select-filter";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

it("submits the report form it belongs to as soon as a choice changes", () => {
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
  render(
    <>
      <form id={REPORT_FILTER_FORM_ID} onSubmit={onSubmit} />
      <SelectFilter
        name="grain"
        label="Summary rows"
        value="day"
        options={[
          { value: "day", label: "Daily" },
          { value: "week", label: "Weekly" },
        ]}
      />
    </>,
  );
  const select = screen.getByLabelText("Summary rows") as HTMLSelectElement;
  expect(select.form?.id).toBe(REPORT_FILTER_FORM_ID);
  fireEvent.change(select, { target: { value: "week" } });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
});
