"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

/**
 * A choice applies as soon as it changes: the whole report form submits, so
 * drafts in the other fields travel with it and an invalid date range still
 * blocks with its message. Without JavaScript, Apply does the same job.
 */
export function SelectFilter({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 items-end gap-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <NativeSelect
          key={value}
          id={id}
          form={REPORT_FILTER_FORM_ID}
          name={name}
          defaultValue={value}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="min-w-0 sm:min-w-40"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <noscript>
        <Button
          type="submit"
          form={REPORT_FILTER_FORM_ID}
          variant="secondary"
          size="sm"
          aria-label={`Apply ${label.toLowerCase()} and all filters`}
        >
          Apply
        </Button>
      </noscript>
    </div>
  );
}
