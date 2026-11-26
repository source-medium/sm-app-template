"use client";

import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { useId } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A list's search as a field of the report form (`q`): the term lives in the
 * URL like every other filter, and Search applies it with the form.
 */
export function ReportSearch({
  label,
  placeholder,
  value,
  maxLength,
}: {
  label: string;
  placeholder: string;
  value: string;
  maxLength: number;
}) {
  const id = useId();
  return (
    // The label sits beside the field from a tablet up, so the search is one row level with the section's title.
    <div role="search" className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="search"
          name="q"
          form={REPORT_FILTER_FORM_ID}
          defaultValue={value}
          maxLength={maxLength}
          placeholder={placeholder}
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
        />
        <Button type="submit" form={REPORT_FILTER_FORM_ID} variant="secondary">
          <Search aria-hidden />
          Search
        </Button>
      </div>
    </div>
  );
}
