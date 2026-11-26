"use client";

import { useId } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { useReportNavigation } from "@/components/shell/report-navigation";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { cn } from "@/lib/utils";

/**
 * A choice applies as soon as it changes, and changes only its own URL key
 * (plus any `clear` keys it invalidates): drafts in other fields, such as typed
 * dates, neither travel with it nor block it. The select stays a field of the
 * report form, so an explicit Apply elsewhere keeps this choice. Like reports
 * themselves, auto-applying filters require JavaScript. `inline` sets the label
 * beside the select, for a section header's actions.
 */
export function SelectFilter({
  name,
  label,
  value,
  options,
  clear = [],
  inline = false,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** Keys a new choice makes meaningless, such as a value picked under the old choice. */
  clear?: readonly string[];
  inline?: boolean;
}) {
  const id = useId();
  const { navigate } = useReportNavigation();
  return (
    <div data-agent-target={label} data-agent-component="SelectFilter" className="flex min-w-0 items-end gap-2">
      <div className={cn("flex min-w-0", inline ? "items-center gap-2" : "flex-col gap-1.5")}>
        <label
          htmlFor={id}
          className={cn("font-medium text-muted-foreground", inline ? "text-sm whitespace-nowrap" : "text-xs")}
        >
          {label}
        </label>
        <NativeSelect
          key={value}
          id={id}
          form={REPORT_FILTER_FORM_ID}
          name={name}
          defaultValue={value}
          onChange={(event) =>
            navigate({ ...Object.fromEntries(clear.map((key) => [key, null])), [name]: event.currentTarget.value })
          }
          className="min-w-0 sm:min-w-40"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
